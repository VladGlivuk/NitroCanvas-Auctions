import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ethers } from 'ethers';
import type { Request, Response } from 'express';
import { ContractService } from '../services/contract.service.js';
import { ERC7824Service } from '../services/erc7824Service.js';
import { NftMarketplaceABI } from '../contracts/NFTMarketplaceABI.js';
import { Router } from 'express';
import { pool, provider, wallet } from '../index.js';
import { env } from '../config/env.js';
import { generateAuctionPricing, DEFAULT_AUCTION_PRICING } from '../utils/pricing.js';

interface CreateAuctionRequest {
  nftId: string;
  sellerId: string;
  startTime: string;
  endTime: string;
  title: string;
  description?: string;
  contractAuctionId?: number;
  useERC7824?: boolean;
  startingPrice?: string;
  minBidIncrement?: string;
}

interface PlaceBidRequest {
  bidAmount: string;
  bidderId: string;
}

const router = Router();
const contractService = new ContractService();

// Get current auction pricing based on USD amounts converted to ETH
router.get('/pricing', async (req: Request, res: Response) => {
  try {
    const pricing = await generateAuctionPricing({
      minimumBidUsd: 1.0,  // $1 USD minimum
      minIncrementUsd: 0.25 // $0.25 USD increment
    });
    
    res.json({
      success: true,
      pricing: {
        minimumBid: {
          usd: pricing.minimumBidUsd,
          eth: pricing.startingPriceEth,
          wei: pricing.startingPriceWei
        },
        minIncrement: {
          usd: pricing.minIncrementUsd,
          eth: pricing.minIncrementEth,
          wei: pricing.minIncrementWei
        },
        ethPrice: pricing.ethPriceUsd,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error getting auction pricing:', error);
    res.status(500).json({ error: 'Failed to get pricing information' });
  }
});

// Initialize ERC-7824 service lazily to avoid initialization order issues
let erc7824Service: ERC7824Service | null = null;

const getERC7824Service = () => {
  if (!erc7824Service) {
    const marketplaceContract = new ethers.Contract(
      env.MARKETPLACE_CONTRACT_ADDRESS,
      NftMarketplaceABI,
      wallet
    );
    erc7824Service = new ERC7824Service(pool, provider, marketplaceContract);
  }
  return erc7824Service;
};

// Create Auction
router.post('/create', async (req: Request<{}, {}, CreateAuctionRequest & { contractAddress: string }>, res: Response) => {
  const { nftId, sellerId, startTime, endTime, title, description, contractAuctionId, contractAddress, useERC7824, startingPrice, minBidIncrement } = req.body;

  // Debug: log incoming payload
  console.log('[Auction Create] Incoming payload:', req.body);

  try {
    // Validate required fields
    const missing = [];
    if (!nftId) missing.push('nftId');
    if (!sellerId) missing.push('sellerId');
    if (!startTime) missing.push('startTime');
    if (!endTime) missing.push('endTime');
    if (!title) missing.push('title');
    if (!contractAddress) missing.push('contractAddress');
    if (missing.length) {
      console.log('[Auction Create] Missing fields:', missing);
      return res.status(400).json({ error: 'Missing required fields', missing });
    }

    // 1. NFT lookup logic removed.
    // nftUuid will now directly be nftId from the payload.

    // 2. Create ERC-7824 channel if requested
    let channelId = null;
    if (useERC7824) {
      try {
        const service = getERC7824Service();
        channelId = await service.createAuctionChannel(uuidv4());
        console.log('[Auction Create] Created ERC-7824 channel:', channelId);
      } catch (error) {
        console.error('[Auction Create] Failed to create ERC-7824 channel:', error);
        return res.status(500).json({ error: 'Failed to create ERC-7824 channel' });
      }
    }

    // 3. Insert auction with all required fields
    const query = `
      INSERT INTO auctions (
        id,
        nft_id,
        seller_id,
        start_time,
        end_time,
        status,
        contract_auction_id,
        title,
        description,
        highest_bidder,
        highest_bid,
        starting_price,
        min_bid_increment
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;

    const auctionId = uuidv4();
    const values = [
      auctionId,
      nftId,
      sellerId,
      startTime,
      endTime,
      'active',
      contractAuctionId || null,
      title,
      description || null,
      ethers.ZeroAddress,
      '0',
      startingPrice ? ethers.parseEther(startingPrice).toString() : (await generateAuctionPricing()).startingPriceWei, // starting_price in wei ($1 USD equivalent)
      minBidIncrement ? ethers.parseEther(minBidIncrement).toString() : (await generateAuctionPricing()).minIncrementWei, // min_bid_increment in wei ($0.25 USD equivalent)
    ];

    console.log('[Auction Create] Inserting auction with values:', values);
    const result = await pool.query(query, values);
    console.log('[Auction Create] Auction insert result:', result.rows);
    
    // Include ERC-7824 channel info in response
    const responseData = {
      ...result.rows[0],
      erc7824_enabled: useERC7824 || false,
      channel_id: channelId
    };
    
    res.status(201).json(responseData);
  } catch (error) {
    console.error('[Auction Create] Error creating auction:', error);
    res.status(500).json({ error: 'Failed to create auction' });
  }
});

// Place Bid (Deprecated - use ERC-7824 bidding via /api/bids)
router.post('/:auctionId/bid', async (req: Request<{ auctionId: string }, {}, PlaceBidRequest>, res: Response) => {
  const { auctionId } = req.params;

  try {
    // Check if auction exists and get its type
    const auctionQuery = `
      SELECT starting_price, min_bid_increment
      FROM auctions
      WHERE id = $1 AND status = 'active'
    `;
    const auctionResult = await pool.query(auctionQuery, [auctionId]);

    if (auctionResult.rows.length === 0) {
      return res.status(404).json({ message: 'Auction not found or not active' });
    }

    // Check if auction has ERC-7824 pricing (starting_price set)
    const hasERC7824Pricing = auctionResult.rows[0].starting_price && auctionResult.rows[0].starting_price !== '0';

    if (hasERC7824Pricing) {
      return res.status(400).json({ 
        message: 'This auction uses ERC-7824 off-chain bidding. Please use /api/bids endpoint instead.',
        redirect: `/api/bids`,
        auction_id: auctionId
      });
    }

    // For legacy auctions without ERC-7824, fall back to old behavior
    return res.status(400).json({ 
      message: 'Legacy bidding not supported. Please use ERC-7824 bidding via /api/bids endpoint.',
      redirect: `/api/bids`
    });
  } catch (error) {
    console.error('Error processing bid:', error);
    res.status(500).json({ error: 'Failed to process bid' });
  }
});

// Complete Auction
router.post('/:auctionId/complete', async (req: Request<{ auctionId: string }, {}, { sellerId: string }>, res: Response) => {
  const { auctionId } = req.params;
  const { sellerId } = req.body;

  try {
    // Get auction from database
    const auctionQuery = `
      SELECT contract_auction_id, seller_id
      FROM auctions
      WHERE id = $1 AND status = 'active'
    `;
    const auctionResult = await pool.query(auctionQuery, [auctionId]);

    if (auctionResult.rows.length === 0) {
      return res.status(404).json({ message: 'Auction not found or not active' });
    }

    if (auctionResult.rows[0].seller_id !== sellerId) {
      return res.status(403).json({ message: 'Only seller can complete auction' });
    }

    // Complete auction on blockchain
    await contractService.completeAuction(auctionResult.rows[0].contract_auction_id);

    // Update auction status in database
    const updateQuery = `
      UPDATE auctions
      SET status = 'completed'
      WHERE id = $1
      RETURNING id, status
    `;
    const updateResult = await pool.query(updateQuery, [auctionId]);

    res.status(200).json({
      auction: updateResult.rows[0],
    });
  } catch (error) {
    console.error('Error completing auction:', error);
    res.status(500).json({ error: 'Failed to complete auction' });
  }
});

// Cancel Auction
router.post('/:auctionId/cancel', async (req: Request<{ auctionId: string }, {}, { sellerId: string }>, res: Response) => {
  const { auctionId } = req.params;
  const { sellerId } = req.body;

  try {
    // Get auction from database
    const auctionQuery = `
      SELECT contract_auction_id, seller_id
      FROM auctions
      WHERE id = $1 AND status = 'active'
    `;
    const auctionResult = await pool.query(auctionQuery, [auctionId]);

    if (auctionResult.rows.length === 0) {
      return res.status(404).json({ message: 'Auction not found or not active' });
    }

    if (auctionResult.rows[0].seller_id !== sellerId) {
      return res.status(403).json({ message: 'Only seller can cancel auction' });
    }

    // Cancel auction on blockchain (only for legacy auctions with valid contract_auction_id)
    if (auctionResult.rows[0].contract_auction_id && auctionResult.rows[0].contract_auction_id !== null) {
      console.log('Cancelling legacy auction on blockchain with contract_auction_id:', auctionResult.rows[0].contract_auction_id);
      await contractService.cancelAuction(auctionResult.rows[0].contract_auction_id);
    } else {
      console.log('Cancelling ERC-7824 auction (no blockchain interaction needed)');
      // For ERC-7824 auctions, no blockchain interaction is needed since bids are off-chain
    }

    // Update auction status in database
    const updateQuery = `
      UPDATE auctions
      SET status = 'cancelled'
      WHERE id = $1
      RETURNING id, status, title, seller_id
    `;
    const updateResult = await pool.query(updateQuery, [auctionId]);

    // Send WebSocket notifications about auction cancellation
    const wss = req.app.get('wss');
    if (wss) {
      const cancelMessage = {
        type: 'auction_cancelled',
        auctionId: auctionId,
        title: updateResult.rows[0].title,
        sellerId: updateResult.rows[0].seller_id,
        message: 'This auction has been cancelled by the seller.'
      };

      wss.clients.forEach((client: any) => {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(JSON.stringify(cancelMessage));
        }
      });

      console.log('Sent auction cancellation notifications');
    }

    res.status(200).json({
      auction: updateResult.rows[0],
    });
  } catch (error) {
    console.error('Error cancelling auction:', error);
    res.status(500).json({ error: 'Failed to cancel auction' });
  }
});

// Get Auction Details
router.get('/:auctionId', async (req: Request<{ auctionId: string }>, res: Response) => {
  const { auctionId } = req.params;

  try {
    const auctionQuery = `
      SELECT a.*
      FROM auctions a
      WHERE a.id = $1
    `;
    const auctionResult = await pool.query(auctionQuery, [auctionId]);

    if (auctionResult.rows.length === 0) {
      return res.status(404).json({ message: 'Auction not found' });
    }

    res.status(200).json({
      ...auctionResult.rows[0],
    });
  } catch (error) {
    console.error('Error getting auction details:', error);
    res.status(500).json({ error: 'Failed to get auction details' });
  }
});

// Get All Auctions with Pagination
router.get('/', async (req: Request<{}, {}, {}, { page?: string; limit?: string; sellerId?: string }>, res: Response) => {
  const page = parseInt(req.query.page || '1');
  const limit = parseInt(req.query.limit || '10');
  const offset = (page - 1) * limit;
  const sellerId = req.query.sellerId?.toLowerCase();

  try {
    // Get total count of auctions
    const countQuery = sellerId
      ? 'SELECT COUNT(*) FROM auctions WHERE status = $1 OR (seller_id = $2 AND status != $3)'
      : 'SELECT COUNT(*) FROM auctions WHERE status = $1';

    const countParams = sellerId ? ['active', sellerId, 'cancelled'] : ['active'];

    const totalCountResult = await pool.query(countQuery, countParams);
    const totalAuctions = parseInt(totalCountResult.rows[0].count, 10);

    // Get paginated auctions
    const auctionsQuery = sellerId
      ? `
        SELECT *
        FROM auctions
        WHERE status = $1 OR (seller_id = $2 AND status != $3)
        ORDER BY created_at DESC
        LIMIT $4 OFFSET $5
      `
      : `
        SELECT *
        FROM auctions
        WHERE status = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `;

    const queryParams = sellerId ? ['active', sellerId, 'cancelled', limit, offset] : ['active', limit, offset];

    const auctionsResult = await pool.query(auctionsQuery, queryParams);

    res.status(200).json({
      auctions: auctionsResult.rows,
      totalAuctions,
      currentPage: page,
      perPage: limit,
      totalPages: Math.ceil(totalAuctions / limit),
    });
  } catch (error) {
    console.error('Error fetching all auctions:', error);
    res.status(500).json({ error: 'Failed to fetch auctions' });
  }
});

// Settle Auction (ERC-7824 compatible)
router.post('/:auctionId/settle', async (req: Request<{ auctionId: string }>, res: Response) => {
  const { auctionId } = req.params;

  try {
    console.log(`Settling auction ${auctionId}`);

    // Get WebSocket server from app
    const wss = req.app.get('wss');

    // Initialize ERC7824Service
    console.log('MARKETPLACE_CONTRACT_ADDRESS:', env.MARKETPLACE_CONTRACT_ADDRESS);
    console.log('Wallet address:', wallet.address);
    
    const marketplaceContract = new ethers.Contract(
      env.MARKETPLACE_CONTRACT_ADDRESS,
      NftMarketplaceABI,
      wallet
    );
    
    console.log('Created marketplaceContract:', marketplaceContract.target);
    console.log('Contract interface fragments:', marketplaceContract.interface.fragments.length);
    
    const erc7824Service = new ERC7824Service(pool, provider, marketplaceContract, wss);
    
    // Call settlement logic
    await erc7824Service.settleAuction(auctionId);
    
    console.log('Settlement completed successfully');

    res.status(200).json({
      message: 'Auction settled successfully',
      auctionId: auctionId
    });
  } catch (error: any) {
    console.error('Error settling auction:', error);
    res.status(500).json({ 
      error: 'Failed to settle auction',
      message: error.message 
    });
  }
});

export default router;
