import { pool, provider, wallet } from "../index.js";
import { ethers } from "ethers";
import cron from 'node-cron';
import { ERC7824Service } from '../services/erc7824Service.js';
import { NftMarketplaceABI } from '../contracts/NFTMarketplaceABI.js';
import { env } from '../config/env.js';

// Initialize ERC7824 service lazily to avoid initialization order issues
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

// Auction settlement job - runs every 30 seconds
cron.schedule('*/30 * * * * *', async () => {
  try {
    console.log('Running auction settlement check...');
    
    // Find expired auctions that need settlement
    const expiredAuctions = await pool.query(`
      SELECT id, contract_auction_id, title, end_time
      FROM auctions 
      WHERE end_time < NOW() 
        AND status = 'active' 
        AND (settlement_status IS NULL OR settlement_status != 'completed')
      ORDER BY end_time ASC
      LIMIT 10
    `);

    if (expiredAuctions.rows.length === 0) {
      console.log('No auctions to settle');
      return;
    }

    console.log(`Found ${expiredAuctions.rows.length} auctions to settle`);

    for (const auction of expiredAuctions.rows) {
      try {
        console.log(`Settling auction ${auction.id} (${auction.title})`);
        
        // Mark settlement as starting
        await pool.query(
          'UPDATE auctions SET settlement_status = $1, settlement_attempted_at = $2 WHERE id = $3',
          ['processing', new Date(), auction.id]
        );

        // Get winning bid for this auction
        const service = getERC7824Service();
        const winningBid = await service.getWinningBid(auction.id);
        
        if (!winningBid) {
          console.log(`No bids found for auction ${auction.id}, settling with no winner`);
          
          // Complete auction with no winner
          const tx = await marketplaceContract.completeAuction(auction.contract_auction_id);
          await tx.wait();
          
          await pool.query(
            'UPDATE auctions SET status = $1, settlement_status = $2, settlement_tx_hash = $3 WHERE id = $4',
            ['completed', 'completed', tx.hash, auction.id]
          );
          
          console.log(`Auction ${auction.id} completed with no bids. TX: ${tx.hash}`);
          continue;
        }

        console.log(`Processing winning bid for auction ${auction.id}: ${winningBid.amount} ETH from ${winningBid.bidder}`);

        // Settle auction with winning bid using ERC-7824
        const tx = await marketplaceContract.settleERC7824Auction(
          auction.contract_auction_id,
          auction.id, // auction ID string
          winningBid.bidder,
          winningBid.amount,
          winningBid.nonce,
          winningBid.timestamp,
          winningBid.signature,
          {
            value: winningBid.amount, // Winner pays the bid amount
            gasLimit: 500000
          }
        );

        console.log(`Settlement transaction sent for auction ${auction.id}: ${tx.hash}`);
        
        // Wait for confirmation
        const receipt = await tx.wait();
        console.log(`Settlement confirmed for auction ${auction.id} in block ${receipt.blockNumber}`);

        // Update auction status
        await pool.query(`
          UPDATE auctions 
          SET status = 'completed', 
              settlement_status = 'completed',
              settlement_tx_hash = $1,
              highest_bidder = $2,
              highest_bid = $3,
              updated_at = NOW()
          WHERE id = $4
        `, [tx.hash, winningBid.bidder, winningBid.amount, auction.id]);


        console.log(`✅ Auction ${auction.id} settled successfully`);

      } catch (auctionError: any) {
        console.error(`❌ Failed to settle auction ${auction.id}:`, auctionError.message);
        
        await pool.query(
          'UPDATE auctions SET settlement_status = $1, settlement_error = $2 WHERE id = $3',
          ['failed', auctionError.message, auction.id]
        );
      }
    }

  } catch (error: any) {
    console.error('❌ Settlement job error:', error.message);
  }
});

// Health check job - runs every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  try {
    // Check for stuck settlements (processing for more than 10 minutes)
    const stuckSettlements = await pool.query(`
      SELECT id, title, settlement_attempted_at
      FROM auctions 
      WHERE settlement_status = 'processing' 
        AND settlement_attempted_at < NOW() - INTERVAL '10 minutes'
    `);

    if (stuckSettlements.rows.length > 0) {
      console.log(`⚠️  Found ${stuckSettlements.rows.length} stuck settlements`);
      
      // Reset stuck settlements to allow retry
      await pool.query(`
        UPDATE auctions 
        SET settlement_status = NULL, settlement_attempted_at = NULL
        WHERE settlement_status = 'processing' 
          AND settlement_attempted_at < NOW() - INTERVAL '10 minutes'
      `);
    }

    // Clean up old error messages from failed settlements (older than 30 days)
    await pool.query(`
      UPDATE auctions 
      SET settlement_error = NULL
      WHERE settlement_status = 'failed' 
        AND settlement_attempted_at < NOW() - INTERVAL '30 days'
    `);

  } catch (error: any) {
    console.error('Health check error:', error.message);
  }
});

console.log('🕐 Auction settlement jobs initialized');
console.log('   - Settlement check: every 30 seconds');
console.log('   - Health check: every 5 minutes');

export { getERC7824Service };