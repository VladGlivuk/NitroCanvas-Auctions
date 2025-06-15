// src/routes/auction.routes.ts
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ethers } from 'ethers';
import type { Request, Response } from 'express';
import { ContractService } from '../services/contract.service.js';
import { Router } from 'express';
import { pool } from '../index.js';

// Interfaces
interface CreateAuctionRequest {
  nftId: string;
  sellerId: string;
  startTime: string;
  endTime: string;
  title: string;
  description?: string;
  contractAuctionId?: number;
}

interface PlaceBidRequest {
  bidAmount: string;
  bidderId: string;
}

const router = Router();
const contractService = new ContractService();

// Create Auction
router.post('/create', async (req: Request<{}, {}, CreateAuctionRequest & { contractAddress: string }>, res: Response) => {
  const { nftId, sellerId, startTime, endTime, title, description, contractAuctionId, contractAddress } = req.body;

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

    // 2. Insert auction with all required fields
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
        highest_bid
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const values = [
      uuidv4(), // id
      nftId, // nft_id (directly from payload)
      sellerId, // seller_id (wallet address)
      startTime, // start_time
      endTime, // end_time
      'active', // status
      contractAuctionId || null, // contract_auction_id
      title, // title
      description || null, // description
      null, // highest_bidder
      null, // highest_bid
    ];

    console.log('[Auction Create] Inserting auction with values:', values);
    const result = await pool.query(query, values);
    console.log('[Auction Create] Auction insert result:', result.rows);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('[Auction Create] Error creating auction:', error);
    res.status(500).json({ error: 'Failed to create auction' });
  }
});

// Place Bid
router.post('/:auctionId/bid', async (req: Request<{ auctionId: string }, {}, PlaceBidRequest>, res: Response) => {
  const { auctionId } = req.params;
  const { bidAmount, bidderId } = req.body;

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
    res.status(500).json({ error: 'Failed to place bid' });
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

export default router;
