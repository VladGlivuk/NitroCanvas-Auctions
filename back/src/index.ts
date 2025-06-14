// src/index.ts
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { Pool } from "pg";
import { ethers } from "ethers";
import { env } from "../src/config/env.ts";
import authRoutes from "./routes/auth.routes.ts";
import auctionRoutes from "./routes/auction.routes.ts"; // New file for auction routes
import { authenticate } from "./middleware/auth.middleware.ts";
import { NitroliteRPC } from "@erc7824/nitrolite";
import cors from "cors";

const app = express();
const port = env.PORT;

// Middleware
app.use(express.json());
app.use(cors({ origin: "http://localhost:5173" }));

// PostgreSQL Connection
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

(async () => {
  try {
    await pool.connect();
    console.log("Connected to PostgreSQL");
  } catch (err: any) {
    console.error("Database connection error:", err.stack);
    process.exit(1);
  }
})();

// Ethers.js Configuration (v6)
export const provider = new ethers.JsonRpcProvider(env.INFURA_URL);
export const wallet = new ethers.Wallet(env.PRIVATE_KEY!, provider);

// Nitrolite SDK Initialization
export const nitro = NitroliteRPC;
// nitro.setProvider(provider); // TODO
// nitro.setSigner(wallet); // TODO
// nitro.setAdjudicatorAddress(process.env.CONTRACT_ADDRESS!); // TODO

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/auctions", authenticate, auctionRoutes);

// Global Error Handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// Start Server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
