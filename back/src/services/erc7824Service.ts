import { ethers } from 'ethers';
import { Pool } from 'pg';
import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';

export interface BidData {
  auctionId: string;
  bidder: string;
  amount: string;
  signature: string;
  nonce: number;
  timestamp: number;
}

export interface AuctionChannelState {
  auctionId: string;
  participants: string[];
  bids: BidData[];
  highestBid: string;
  highestBidder: string;
  turnNum: number;
}

export class ERC7824Service {
  private db: Pool;
  private provider: ethers.Provider;
  private marketplaceContract: ethers.Contract;
  private channels: Map<string, AuctionChannelState> = new Map();
  private wsConnections: Map<string, WebSocket[]> = new Map();
  private domain: any;
  private wss?: any;

  constructor(
    db: Pool,
    provider: ethers.Provider,
    marketplaceContract: ethers.Contract,
    wss?: any
  ) {
    this.db = db;
    this.provider = provider;
    this.marketplaceContract = marketplaceContract;
    this.wss = wss;
    
    console.log('ERC7824Service constructor - marketplaceContract:', !!marketplaceContract);
    console.log('ERC7824Service constructor - marketplaceContract.target:', marketplaceContract?.target);
    
    // Initialize domain synchronously for testing
    this.domain = {
      name: 'NFTMarketplaceAuction',
      version: '1',
      chainId: 11155111, // Sepolia
      verifyingContract: marketplaceContract.target
    };
    
    console.log('ERC-7824 service initialized for domain:', this.domain);
  }

  // Create a new auction channel for ERC-7824 bidding
  async createAuctionChannel(auctionId: string): Promise<string> {
    try {
      const channelId = ethers.keccak256(ethers.toUtf8Bytes(`auction_${auctionId}_${Date.now()}`));
      
      // Initialize channel state
      const initialState: AuctionChannelState = {
        auctionId,
        participants: [],
        bids: [],
        highestBid: '0',
        highestBidder: ethers.ZeroAddress,
        turnNum: 0
      };

      this.channels.set(channelId, initialState);
      console.log(`Created ERC-7824 channel ${channelId} for auction ${auctionId}`);

      return channelId;
    } catch (error) {
      console.error('Failed to create auction channel:', error);
      throw error;
    }
  }

  // Process incoming bid
  async processBid(channelId: string, bidData: BidData): Promise<boolean> {
    try {
      // Validate signature
      const isValidSignature = await this.validateBidSignature(bidData);
      if (!isValidSignature) {
        throw new Error('Invalid bid signature');
      }

      // Get current channel state
      const currentState = this.channels.get(channelId);
      if (!currentState) {
        throw new Error('Channel not found');
      }

      // Validate bid amount
      const bidAmount = ethers.getBigInt(bidData.amount);
      const currentHighest = currentState.highestBid === '0' || !currentState.highestBid 
        ? 0n 
        : ethers.getBigInt(currentState.highestBid);
      
      // Get auction details for minimum increment validation
      const auctionResult = await this.db.query(
        'SELECT starting_price, min_bid_increment FROM auctions WHERE id = $1',
        [bidData.auctionId]
      );
      
      if (auctionResult.rows.length === 0) {
        throw new Error('Auction not found');
      }

      const { starting_price, min_bid_increment } = auctionResult.rows[0];
      const minBid = currentHighest === 0n 
        ? ethers.getBigInt(starting_price)
        : currentHighest + ethers.getBigInt(min_bid_increment);

      console.log('Bid validation:', {
        bidAmount: ethers.formatEther(bidAmount),
        currentHighest: ethers.formatEther(currentHighest),
        startingPrice: ethers.formatEther(starting_price),
        minBidIncrement: ethers.formatEther(min_bid_increment),
        requiredMinBid: ethers.formatEther(minBid)
      });

      if (bidAmount < minBid) {
        throw new Error(`Bid amount too low. Required: ${ethers.formatEther(minBid)} ETH, provided: ${ethers.formatEther(bidAmount)} ETH`);
      }

      // Update channel state
      const newState: AuctionChannelState = {
        ...currentState,
        bids: [...currentState.bids, bidData],
        highestBid: bidData.amount,
        highestBidder: bidData.bidder,
        turnNum: currentState.turnNum + 1
      };

      // Store bid in database
      await this.storeBid(bidData, channelId);

      await this.db.query(`
        UPDATE auctions 
        SET highest_bidder = $1, highest_bid = $2, updated_at = NOW()
        WHERE id = $3
      `, [bidData.bidder, bidData.amount, bidData.auctionId]);
      
      console.log(`Updated auction ${bidData.auctionId} with highest bid: ${ethers.formatEther(bidData.amount)} ETH from ${bidData.bidder}`);

      // Update channel state
      this.channels.set(channelId, newState);

      // Notify WebSocket clients
      this.broadcastBidUpdate(channelId, bidData);

      return true;
    } catch (error) {
      console.error('Failed to process bid:', error);
      throw error;
    }
  }

  // Validate bid signature using EIP-712
  private async validateBidSignature(bidData: BidData): Promise<boolean> {
    try {
      const types = {
        Bid: [
          { name: 'auctionId', type: 'string' },
          { name: 'bidder', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'timestamp', type: 'uint256' }
        ]
      };

      const value = {
        auctionId: bidData.auctionId,
        bidder: bidData.bidder,
        amount: bidData.amount,
        nonce: bidData.nonce,
        timestamp: bidData.timestamp
      };

      const recoveredAddress = ethers.verifyTypedData(
        this.domain,
        types,
        value,
        bidData.signature
      );

      return recoveredAddress.toLowerCase() === bidData.bidder.toLowerCase();
    } catch (error) {
      console.error('Signature validation error:', error);
      return false;
    }
  }

  // Store bid in database
  private async storeBid(bidData: BidData, channelId: string): Promise<void> {
    const bidHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['string', 'address', 'uint256', 'uint256', 'uint256'],
        [bidData.auctionId, bidData.bidder, bidData.amount, bidData.nonce, bidData.timestamp]
      )
    );

    // Calculate signature validity (auction end time)
    const auctionResult = await this.db.query(
      'SELECT end_time FROM auctions WHERE id = $1',
      [bidData.auctionId]
    );

    const validUntil = auctionResult.rows[0]?.end_time;

    // For testing: Create a temporary user record if it doesn't exist
    // In production, this should be handled by proper authentication
    const userCheckResult = await this.db.query(
      'SELECT id FROM users WHERE wallet_address = $1',
      [bidData.bidder]
    );
    
    let bidderId;
    if (userCheckResult.rows.length === 0) {
      // Create temporary user for testing
      const newUserResult = await this.db.query(`
        INSERT INTO users (id, wallet_address, username, created_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (wallet_address) DO UPDATE SET wallet_address = EXCLUDED.wallet_address
        RETURNING id
      `, [
        uuidv4(), // Generate proper UUID
        bidData.bidder,
        `test-user-${bidData.bidder.slice(0, 8)}`,
        new Date()
      ]);
      bidderId = newUserResult.rows[0].id;
    } else {
      bidderId = userCheckResult.rows[0].id;
    }

    await this.db.query(`
      INSERT INTO bids 
      (id, auction_id, bidder_id, amount, signature, nonce, bid_hash, signature_valid_until, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (bid_hash) DO NOTHING
    `, [
      uuidv4(), // Generate proper UUID for bid
      bidData.auctionId,
      bidderId, // Use proper user UUID
      bidData.amount,
      bidData.signature,
      bidData.nonce,
      bidHash,
      validUntil,
      new Date(bidData.timestamp * 1000)
    ]);
  }

  // Settlement process when auction ends
  async settleAuction(auctionId: string): Promise<void> {
    try {
      console.log(`Starting settlement for auction ${auctionId}`);

      // Get auction details and winning bid
      const auctionResult = await this.db.query(`
        SELECT a.*, b.bidder_id, b.amount as winning_amount, b.signature
        FROM auctions a
        LEFT JOIN bids b ON a.id = b.auction_id
        WHERE a.id = $1 AND b.amount = (
          SELECT MAX(amount) FROM bids WHERE auction_id = $1
        )
        ORDER BY b.timestamp ASC
        LIMIT 1
      `, [auctionId]);

      if (auctionResult.rows.length === 0) {
        throw new Error('Auction or winning bid not found');
      }

      const auction = auctionResult.rows[0];
      
      console.log('Auction data:', {
        id: auction.id,
        contract_auction_id: auction.contract_auction_id,
        status: auction.status,
        winning_amount: auction.winning_amount,
        bidder_id: auction.bidder_id
      });
      
      // Update auction status
      await this.db.query(
        'UPDATE auctions SET settlement_status = $1, settlement_attempted_at = $2 WHERE id = $3',
        ['processing', new Date(), auctionId]
      );

      if (!auction.winning_amount || auction.winning_amount === '0') {
        // No bids, return NFT to seller
        await this.handleNoBidsSettlement(auction);
      } else {
        // Check if this is an ERC-7824 auction (no valid contract_auction_id)
        if (!auction.contract_auction_id || auction.contract_auction_id === null) {
          console.log('Processing ERC-7824 auction settlement (no contract_auction_id)');
          await this.processERC7824Settlement(auction);
        } else {
          // Process legacy auction settlement
          console.log('Processing legacy auction settlement with contract_auction_id:', auction.contract_auction_id);
          await this.processWinningBidSettlement(auction);
        }
      }

    } catch (error) {
      console.error(`Settlement failed for auction ${auctionId}:`, error);
      
      // Mark settlement as failed
      await this.db.query(
        'UPDATE auctions SET settlement_status = $1 WHERE id = $2',
        ['failed', auctionId]
      );

      // Store settlement attempt
      await this.db.query(`
        INSERT INTO settlement_attempts (id, auction_id, status, error_message, attempted_at)
        VALUES ($1, $2, 'failed', $3, $4)
      `, [
        ethers.keccak256(ethers.toUtf8Bytes(`${auctionId}_${Date.now()}`)),
        auctionId,
        error.message,
        new Date()
      ]);

      throw error;
    }
  }

  private async processERC7824Settlement(auction: any): Promise<void> {
    try {
      console.log('Processing ERC-7824 settlement for auction:', auction.id);
      
      // For ERC-7824 auctions, we just need to mark them as completed
      // The bids are off-chain and don't need blockchain settlement
      await this.db.query(
        'UPDATE auctions SET status = $1, settlement_status = $2 WHERE id = $3',
        ['completed', 'completed', auction.id]
      );

      // Send notifications about auction completion
      await this.sendAuctionCompletionNotifications(auction);

      console.log('ERC-7824 auction marked as completed:', auction.id);
      
    } catch (error) {
      console.error('Error in ERC-7824 settlement:', error);
      throw error;
    }
  }

  private async processWinningBidSettlement(auction: any): Promise<void> {
    try {
      console.log('processWinningBidSettlement - this.marketplaceContract:', !!this.marketplaceContract);
      console.log('processWinningBidSettlement - auction.contract_auction_id:', auction.contract_auction_id);
      
      if (!this.marketplaceContract) {
        throw new Error('marketplaceContract is not defined');
      }
      
      // Call smart contract settlement function
      console.log('About to call completeAuction with contract_auction_id:', auction.contract_auction_id);
      console.log('Contract methods available:', Object.getOwnPropertyNames(this.marketplaceContract));
      
      if (!auction.contract_auction_id) {
        throw new Error('contract_auction_id is null or undefined');
      }
      
      const contractCall = this.marketplaceContract.completeAuction(
        auction.contract_auction_id,
        { gasLimit: 500000 }
      );
      
      console.log('Contract call result:', contractCall);
      
      if (!contractCall || typeof contractCall.then !== 'function') {
        throw new Error('Contract call did not return a promise');
      }
      
      const tx = await contractCall;

      // Store settlement attempt
      const settlementId = ethers.keccak256(ethers.toUtf8Bytes(`${auction.id}_${Date.now()}`));
      await this.db.query(`
        INSERT INTO settlement_attempts 
        (id, auction_id, winning_bid_id, tx_hash, status, attempted_at)
        VALUES ($1, $2, $3, $4, 'pending', $5)
      `, [
        settlementId,
        auction.id,
        auction.bidder_id,
        tx.hash,
        new Date()
      ]);

      // Wait for transaction confirmation
      const receipt = await tx.wait();

      // Update settlement status
      await this.db.query(`
        UPDATE settlement_attempts 
        SET status = 'success', gas_used = $1, block_number = $2, completed_at = $3
        WHERE tx_hash = $4
      `, [receipt.gasUsed.toString(), receipt.blockNumber, new Date(), tx.hash]);

      // Update auction
      await this.db.query(`
        UPDATE auctions 
        SET status = 'completed', settlement_status = 'completed', 
            settlement_tx_hash = $1, highest_bidder = $2, highest_bid = $3
        WHERE id = $4
      `, [tx.hash, auction.bidder_id, auction.winning_amount, auction.id]);

      console.log(`Auction ${auction.id} settled successfully. TX: ${tx.hash}`);

    } catch (error) {
      console.error('Settlement transaction failed:', error);
      throw error;
    }
  }

  private async handleNoBidsSettlement(auction: any): Promise<void> {
    // For no bids, we still need to call the contract to return NFT to seller
    try {
      const tx = await this.marketplaceContract.completeAuction(
        auction.contract_auction_id,
        { gasLimit: 300000 }
      );

      await tx.wait();

      await this.db.query(
        'UPDATE auctions SET status = $1, settlement_status = $2 WHERE id = $3',
        ['completed', 'completed', auction.id]
      );

      console.log(`Auction ${auction.id} completed with no bids. TX: ${tx.hash}`);
    } catch (error) {
      console.error('No bids settlement failed:', error);
      throw error;
    }
  }

  // WebSocket management for real-time updates
  addWebSocketConnection(auctionId: string, ws: WebSocket): void {
    if (!this.wsConnections.has(auctionId)) {
      this.wsConnections.set(auctionId, []);
    }
    this.wsConnections.get(auctionId)?.push(ws);

    ws.on('close', () => {
      const connections = this.wsConnections.get(auctionId);
      if (connections) {
        const index = connections.indexOf(ws);
        if (index > -1) {
          connections.splice(index, 1);
        }
      }
    });
  }

  private broadcastBidUpdate(channelId: string, bidData: BidData): void {
    const connections = this.wsConnections.get(bidData.auctionId);
    if (connections) {
      const message = JSON.stringify({
        type: 'bid_update',
        auctionId: bidData.auctionId,
        bid: bidData,
        channelId
      });

      connections.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      });
    }
  }

  // Get winning bid for auction settlement
  async getWinningBid(auctionId: string): Promise<BidData | null> {
    try {
      const result = await this.db.query(`
        SELECT bidder_id as bidder, amount, signature, nonce, 
               EXTRACT(EPOCH FROM timestamp)::bigint as timestamp
        FROM bids 
        WHERE auction_id = $1 
        ORDER BY CAST(amount AS NUMERIC) DESC, timestamp ASC 
        LIMIT 1
      `, [auctionId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        auctionId,
        bidder: row.bidder,
        amount: row.amount,
        signature: row.signature,
        nonce: row.nonce,
        timestamp: row.timestamp
      };
    } catch (error) {
      console.error('Failed to get winning bid:', error);
      return null;
    }
  }

  // Get channel state for auction
  getChannelState(channelId: string): AuctionChannelState | null {
    return this.channels.get(channelId) || null;
  }

  // Send notifications about auction completion
  private async sendAuctionCompletionNotifications(auction: any): Promise<void> {
    try {
      console.log('Sending auction completion notifications for:', auction.id);

      // Get all bidders for this auction
      const biddersResult = await this.db.query(`
        SELECT DISTINCT bidder_id
        FROM bids 
        WHERE auction_id = $1
      `, [auction.id]);

      const bidders = biddersResult.rows.map(row => row.bidder_id);
      
      // Determine winner
      const winnerAddress = auction.bidder_id;
      const winningAmount = auction.winning_amount;

      // Broadcast to WebSocket clients
      if (this.wss) {
        const completionMessage = {
          type: 'auction_completed',
          auctionId: auction.id,
          winner: winnerAddress,
          winningAmount: winningAmount,
          title: auction.title,
          sellerId: auction.seller_id
        };

        // Send to all connected clients
        this.wss.clients.forEach((client: any) => {
          if (client.readyState === 1) { // WebSocket.OPEN
            client.send(JSON.stringify(completionMessage));
          }
        });

        console.log('Sent WebSocket notifications to all clients');
      }

      // Send redirect message specifically for the auction page
      if (this.wss) {
        const redirectMessage = {
          type: 'auction_redirect',
          auctionId: auction.id,
          message: 'Auction has been completed. Redirecting to home page...'
        };

        this.wss.clients.forEach((client: any) => {
          if (client.readyState === 1) {
            client.send(JSON.stringify(redirectMessage));
          }
        });
      }

    } catch (error) {
      console.error('Failed to send auction completion notifications:', error);
    }
  }

  // Cleanup method
  async disconnect(): Promise<void> {
    this.wsConnections.clear();
    this.channels.clear();
  }
}
