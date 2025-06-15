import express, { type Request, type Response, type NextFunction } from 'express';
import { pool } from '../index.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { ERC7824Service, type BidData } from '../services/erc7824Service.js';
import { provider, wallet } from '../index.js';
import { ethers } from 'ethers';
import { env } from '../config/env.js';

const router = express.Router();

// Initialize ERC7824 service lazily to avoid initialization order issues
let erc7824Service: ERC7824Service | null = null;

// Import the marketplace contract ABI
import { NftMarketplaceABI } from '../contracts/NFTMarketplaceABI.js';

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

// Place a bid using ERC-7824 off-chain signatures
router.post(
  '/bids',
  // authenticate, // Temporarily disabled for testing
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { auctionId, amount, signature, nonce, timestamp, bidder } = req.body;
      // const bidder = req.user?.wallet_address as string; // From auth
      
      if (!bidder) {
        return res.status(400).json({ error: 'Bidder wallet address required in request body for testing' });
      }

      // Create bid data structure
      const bidData: BidData = {
        auctionId,
        bidder,
        amount,
        signature,
        nonce,
        timestamp
      };

      // Get or create channel for this auction
      let channelId = req.app.get(`auction_channel_${auctionId}`);
      if (!channelId) {
        const service = getERC7824Service();
        channelId = await service.createAuctionChannel(auctionId);
        req.app.set(`auction_channel_${auctionId}`, channelId);
      }

      // Process the bid
      const service = getERC7824Service();
      const success = await service.processBid(channelId, bidData);

      if (success) {
        // Get updated bids for this auction
        const bidsResult = await pool.query(`
          SELECT bidder_id, amount, timestamp, nonce 
          FROM bids 
          WHERE auction_id = $1 
          ORDER BY CAST(amount AS NUMERIC) DESC, timestamp ASC
        `, [auctionId]);

        res.status(200).json({
          success: true,
          message: 'Bid placed successfully',
          bids: bidsResult.rows
        });
      } else {
        res.status(400).json({ error: 'Failed to process bid' });
      }
    } catch (err: any) {
      console.error('Bid processing error:', err);
      console.error('Error stack:', err.stack);
      console.error('Request body:', req.body);
      res.status(500).json({ error: 'Bid processing failed', details: err.message });
    }
  }
);

// Get current bids for an auction
router.get(
  '/bids/:auctionId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { auctionId } = req.params;
      
      const bidsResult = await pool.query(`
        SELECT bidder_id, amount, timestamp, nonce,
               CASE WHEN signature_valid_until > NOW() THEN 'valid' ELSE 'expired' END as status
        FROM bids 
        WHERE auction_id = $1 
        ORDER BY CAST(amount AS NUMERIC) DESC, timestamp ASC
      `, [auctionId]);

      res.json({
        auctionId,
        bids: bidsResult.rows
      });
    } catch (err) {
      next(err);
    }
  }
);

// Get ERC7824 service instance for WebSocket connections  
export { getERC7824Service };

export default router;