// src/routes/auction.routes.ts
import express from 'express';
import { pool } from '../index';
import { v4 as uuidv4 } from 'uuid';
import { ethers } from 'ethers';
import type { Request, Response, NextFunction } from 'express';
import { ContractService } from '../services/contract.service';

// Interfaces
interface CreateAuctionRequest {
  tokenId: string;
  contractAddress: string;
  startingPrice: string;
  minBidIncrement: string;
  duration: number;
}

interface PlaceBidRequest {
  bidAmount: string;
}

const router = express.Router();
const contractService = new ContractService();

// Create Auction
router.post('/create', async (req: Request<{}, {}, CreateAuctionRequest>, res: Response, next: NextFunction) => {
  const { tokenId, contractAddress, startingPrice, minBidIncrement, duration } = req.body;
  const sellerId = req.user?.wallet_address;

  try {
    if (!sellerId || !tokenId || !contractAddress || !startingPrice || !minBidIncrement || !duration) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Create auction on blockchain
    const auctionId = await contractService.createAuction(contractAddress, tokenId, startingPrice, minBidIncrement, duration);

    // Insert into auctions table
    const query = `
        INSERT INTO auctions (id, nft_id, seller_id, start_time, end_time, status, contract_auction_id)
        VALUES ($1, $2, $3, NOW(), NOW() + interval '${duration} seconds', $4, $5)
        RETURNING id, nft_id, seller_id, start_time, end_time, status, contract_auction_id, created_at
      `;
    const values = [uuidv4(), tokenId, sellerId, 'active', auctionId];
    const result = await pool.query(query, values);

    res.status(201).json({
      auction: result.rows[0],
      contractAuctionId: auctionId,
    });
  } catch (error) {
    console.error('Error creating auction:', error);
    next(error);
  }
});

// Place Bid
router.post('/:auctionId/bid', async (req: Request<{ auctionId: string }, {}, PlaceBidRequest>, res: Response, next: NextFunction) => {
  const { auctionId } = req.params;
  const { bidAmount } = req.body;
  const bidderId = req.user?.wallet_address;

  try {
    if (!bidderId || !bidAmount) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

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

    if (auctionResult.rows[0].seller_id === bidderId) {
      return res.status(400).json({ message: 'Seller cannot bid on their own auction' });
    }

    // Place bid on blockchain
    await contractService.placeBid(auctionResult.rows[0].contract_auction_id, bidAmount);

    // Update auction in database
    const updateQuery = `
        UPDATE auctions
        SET highest_bidder = $1, highest_bid = $2
        WHERE id = $3
        RETURNING id, highest_bidder, highest_bid
      `;
    const updateResult = await pool.query(updateQuery, [bidderId, bidAmount, auctionId]);

    res.status(200).json({
      auction: updateResult.rows[0],
    });
  } catch (error) {
    console.error('Error placing bid:', error);
    next(error);
  }
});

// Complete Auction
router.post('/:auctionId/complete', async (req: Request<{ auctionId: string }>, res: Response, next: NextFunction) => {
  const { auctionId } = req.params;
  const userId = req.user?.wallet_address;

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

    if (auctionResult.rows[0].seller_id !== userId) {
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
    next(error);
  }
});

// Cancel Auction
router.post('/:auctionId/cancel', async (req: Request<{ auctionId: string }>, res: Response, next: NextFunction) => {
  const { auctionId } = req.params;
  const userId = req.user?.wallet_address;

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

    if (auctionResult.rows[0].seller_id !== userId) {
      return res.status(403).json({ message: 'Only seller can cancel auction' });
    }

    // Cancel auction on blockchain
    await contractService.cancelAuction(auctionResult.rows[0].contract_auction_id);

    // Update auction status in database
    const updateQuery = `
        UPDATE auctions
        SET status = 'cancelled'
        WHERE id = $1
        RETURNING id, status
      `;
    const updateResult = await pool.query(updateQuery, [auctionId]);

    res.status(200).json({
      auction: updateResult.rows[0],
    });
  } catch (error) {
    console.error('Error cancelling auction:', error);
    next(error);
  }
});

// Get Auction Details
router.get('/:auctionId', async (req: Request<{ auctionId: string }>, res: Response, next: NextFunction) => {
  const { auctionId } = req.params;

  try {
    // Get auction from database
    const auctionQuery = `
        SELECT a.*, n.token_uri, n.contract_address
        FROM auctions a
        JOIN nfts n ON a.nft_id = n.token_id
        WHERE a.id = $1
      `;
    const auctionResult = await pool.query(auctionQuery, [auctionId]);

    if (auctionResult.rows.length === 0) {
      return res.status(404).json({ message: 'Auction not found' });
    }

    // Get blockchain auction data
    const contractAuction = await contractService.getAuction(auctionResult.rows[0].contract_auction_id);

    res.status(200).json({
      ...auctionResult.rows[0],
      contractAuction,
    });
  } catch (error) {
    console.error('Error getting auction details:', error);
    next(error);
  }
});

export default router;
