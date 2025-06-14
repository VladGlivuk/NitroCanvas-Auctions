// src/routes/auction.routes.ts
import express from "express";
import { pool, provider, wallet, nitro } from "../index.ts";
import { v4 as uuidv4 } from "uuid";
import { ethers } from "ethers";
import type { Request, Response, NextFunction } from "express";

// Interfaces
interface AuctionRequest {
  tokenId: string;
  contractAddress: string;
  startTime: string; // ISO string, e.g., "2025-06-15T12:00:00Z"
  endTime: string; // ISO string
}

interface Nft {
  id: string;
  tokenId: string;
  contractAddress: string;
  ownerId: string;
  tokenUri: string;
  createdAt: Date;
}

const router = express.Router();

// Create Auction
router.post(
  "/create",
  async (
    req: Request<{}, {}, AuctionRequest>,
    res: Response,
    next: NextFunction
  ) => {
    const { tokenId, contractAddress, startTime, endTime } = req.body;
    const sellerId = req.user?.walletAddress; // Updated to camelCase

    try {
      if (!sellerId || !tokenId || !contractAddress || !startTime || !endTime) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Validate NFT ownership
      const nftContract = new ethers.Contract(
        contractAddress,
        ["function ownerOf(uint256 tokenId) view returns (address)"], // ERC-721 ownerOf
        provider
      );
      const owner = await nftContract.ownerOf(tokenId);
      if (owner.toLowerCase() !== sellerId.toLowerCase()) {
        return res.status(403).json({ message: "You do not own this NFT" });
      }

      // Create Nitro channel
      const participants = [sellerId, await wallet.getAddress()]; // Seller and adjudicator
      const channel = await (nitro as any).createChannel(participants, {
        appDefinition: "AuctionApp",
        assetHolder: "IMultiAssetHolder",
        initialState: {
          nftId: tokenId,
          sellerId,
          highestBid: ethers.parseEther("0"),
          currentOwner: sellerId, // Updated to camelCase
        },
      });

      // Insert into auctions table
      const auctionId = uuidv4();
      const query = `
        INSERT INTO auctions (id, nft_id, seller_id, start_time, end_time, status, channel_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, nft_id, seller_id, start_time, end_time, status, channel_id, created_at
      `;
      const values = [
        auctionId,
        tokenId,
        sellerId,
        new Date(startTime),
        new Date(endTime),
        "active",
        channel.id,
      ];
      const auctionResult = await pool.query(query, values);

      // Insert or update NFT record
      const nftId = uuidv4();
      const tokenUri = `https://example.com/nft/${tokenId}`; // Placeholder
      const nftQuery = `
        INSERT INTO nfts (id, token_id, contract_address, owner_id, token_uri)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (token_id, contract_address) DO UPDATE SET owner_id = $4, token_uri = $5
        RETURNING id, token_id, contract_address, owner_id, token_uri, created_at
      `;
      const nftValues = [nftId, tokenId, contractAddress, sellerId, tokenUri];
      const nftResult = await pool.query(nftQuery, nftValues);

      res.status(201).json({
        auction: auctionResult.rows[0],
        nft: nftResult.rows[0],
        channelId: channel.id,
      });
    } catch (error) {
      console.error("Error creating auction:", error);
      next(error);
    }
  }
);

export default router;
