// src/routes/auction.routes.ts
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ethers } from 'ethers';
import type { Request, Response } from 'express';
import { ContractService } from '../services/contract.service.js';
import { Router } from 'express';
import { Pool } from 'pg';

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
const pool = new Pool();

// Create Auction
router.post('/create', async (req: Request<{}, {}, CreateAuctionRequest>, res: Response) => {
  const { nftId, sellerId, startTime, endTime, title, description, contractAuctionId } = req.body;

  try {
    // Validate required fields
    if (!nftId || !sellerId || !startTime || !endTime || !title) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Create new auction
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
        description
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [uuidv4(), nftId, sellerId, startTime, endTime, 'active', contractAuctionId || null, title, description || null];

    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating auction:', error);
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

    // Get blockchain auction data
    const contractAuction = await contractService.getAuction(auctionResult.rows[0].contract_auction_id);

    res.status(200).json({
      ...auctionResult.rows[0],
      contractAuction,
    });
  } catch (error) {
    console.error('Error getting auction details:', error);
    res.status(500).json({ error: 'Failed to get auction details' });
  }
});

export default router;
