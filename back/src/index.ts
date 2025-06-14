// src/index.ts
import * as dotenv from "dotenv";
import express, { type Request, type Response } from "express";
import { Pool } from "pg";
import { ethers } from "ethers";
import { NitroliteRPC } from "@erc7824/nitrolite";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

(async () => {
  try {
    await pool.connect();
    console.log("Connected to PostgreSQL");
  } catch (err: any) {
    console.error("Database connection error:", err.stack);
  }
})();

// Ethers.js Configuration (v6)
const provider = new ethers.JsonRpcProvider(process.env.INFURA_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

// Nitrolite SDK Initialization
const nitro = new NitroliteRPC();
// nitro.setProvider(provider); // TODO
// nitro.setSigner(wallet); // TODO
// nitro.setAdjudicatorAddress(process.env.CONTRACT_ADDRESS!); // TODO

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

// Basic Route for Testing
app.get("/", (req: Request, res: Response) => {
  res.send("NitroCanvas Backend is running!");
});

// Create Auction
app.post(
  "/api/auctions",
  async (req: Request<{}, {}, AuctionRequest>, res: Response) => {
    const { nftId, sellerAddress, bidderAddresses } = req.body;

    try {
      const participants = [
        sellerAddress,
        ...bidderAddresses,
        await wallet.getAddress(),
      ];
      // Replace with actual method from NitroliteRPC docs
      const channel = await (nitro as any).createChannel(participants, {
        appDefinition: "AuctionApp",
        assetHolder: "IMultiAssetHolder",
        initialState: { nftId, highestBid: 0, bidder: null },
      }); // Using 'as any' as a temporary workaround

      const query =
        "INSERT INTO auctions (id, nft_id, seller_id, start_time, end_time, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *";
      const values = [
        uuidv4(),
        nftId,
        sellerAddress,
        new Date(),
        new Date(Date.now() + 24 * 60 * 60 * 1000),
        "active",
      ];
      const result = await pool.query(query, values);

      res.status(201).json({ channelId: channel.id, auction: result.rows[0] });
    } catch (error) {
      console.error("Error creating auction:", error);
      res.status(500).send("Error creating auction");
    }
  }
);

app.post(
  "/api/bids",
  async (req: Request<{}, {}, BidRequest>, res: Response) => {
    const { channelId, bidderAddress, amount } = req.body;

    try {
      // TODO Replace with actual method from NitroliteRPC docs
      const updatedState = await (nitro as any).updateChannelState(channelId, {
        highestBid: ethers.parseEther(amount.toString()),
        bidder: bidderAddress,
      }); // TODO Using 'as any' as a temporary workaround
      await (nitro as any).signState(channelId, bidderAddress);

      const query =
        "INSERT INTO bids (id, auction_id, bidder_id, amount, status) VALUES ($1, $2, $3, $4, $5) RETURNING *";
      const values = [uuidv4(), channelId, bidderAddress, amount, "pending"];
      const result = await pool.query(query, values);

      res.json({ state: updatedState, bid: result.rows[0] });
    } catch (error) {
      console.error("Error submitting bid:", error);
      res.status(500).send("Error submitting bid");
    }
  }
);

// Start Server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
