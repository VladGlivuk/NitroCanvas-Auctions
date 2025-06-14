// src/routes/auction.routes.ts
import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import { pool, provider, wallet, nitro } from "../index.ts";
import { v4 as uuidv4 } from "uuid";
import { ethers } from "ethers";

// Interfaces for Request Bodies
interface AuctionRequest {
  nftId: string;
  sellerAddress: string;
  bidderAddresses: string[];
}

interface BidRequest {
  channelId: string;
  bidderAddress: string;
  amount: number;
}

const router = Router();

// Basic Route for Testing
router.get("/", (req: Request, res: Response) => {
  res.send("NitroCanvas Backend is running!");
});

// Create Auction
router.post(
  "/",
  async (
    req: Request<{}, {}, AuctionRequest>,
    res: Response,
    next: NextFunction
  ) => {
    const { nftId, sellerAddress, bidderAddresses } = req.body;

    try {
      const participants = [
        sellerAddress,
        ...bidderAddresses,
        await wallet.getAddress(),
      ];
      const channel = await (nitro as any).createChannel(participants, {
        appDefinition: "AuctionApp",
        assetHolder: "IMultiAssetHolder",
        initialState: { nftId, highestBid: 0, bidder: null },
      });

      const query =
        "INSERT INTO auctions (id, nft_id, seller_id, start_time, end_time, status, channel_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *";
      const values = [
        uuidv4(),
        nftId,
        sellerAddress,
        new Date(),
        new Date(Date.now() + 24 * 60 * 60 * 1000),
        "active",
        channel.id,
      ];
      const result = await pool.query(query, values);

      res.status(201).json({ channelId: channel.id, auction: result.rows[0] });
    } catch (error) {
      console.error("Error creating auction:", error);
      next(error);
    }
  }
);

// Submit Bid
router.post(
  "/bids",
  async (
    req: Request<{}, {}, BidRequest>,
    res: Response,
    next: NextFunction
  ) => {
    const { channelId, bidderAddress, amount } = req.body;

    try {
      const updatedState = await (nitro as any).updateChannelState(channelId, {
        highestBid: ethers.parseEther(amount.toString()),
        bidder: bidderAddress,
      });
      await (nitro as any).signState(channelId, bidderAddress);

      const query =
        "INSERT INTO bids (id, auction_id, bidder_id, amount, status) VALUES ($1, $2, $3, $4, $5) RETURNING *";
      const values = [uuidv4(), channelId, bidderAddress, amount, "pending"];
      const result = await pool.query(query, values);

      res.status(200).json({ state: updatedState, bid: result.rows[0] }); // Fixed json call
    } catch (error) {
      console.error("Error submitting bid:", error);
      next(error);
    }
  }
);

export default router;
