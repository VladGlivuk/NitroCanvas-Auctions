// src/index.ts
import express, { type Request, type Response, type NextFunction } from 'express';
import { Pool } from 'pg';
import { ethers } from 'ethers';
import { env } from '../src/config/env.ts';
import authRoutes from './routes/auth.routes.js';
import auctionRoutes from './routes/auction.routes.js';
import bidRoutes from './routes/bids.routes.js';
import { authenticate } from './middleware/auth.middleware.ts';
import './jobs/index.js'; // Initialize settlement jobs
// import {NitroliteClient, type NitroliteClientConfig, NitroliteRPC}  from '@erc7824/nitrolite';
import cors from 'cors';
// import { createPublicClient, createWalletClient, http } from 'viem';
// import { privateKeyToAccount } from 'viem/accounts';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';

const app = express();
const port = env.PORT;
const server = createServer(app);

// Middleware
app.use(express.json());
app.use(cors({ 
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, local files)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = ['http://localhost:5173', 'http://localhost:3000'];
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    return callback(null, true); // Allow all origins for testing
  },
  credentials: true 
}));

// PostgreSQL Connection
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

(async () => {
  try {
    await pool.connect();
    console.log('Connected to PostgreSQL');
  } catch (err: any) {
    console.error('Database connection error:', err.stack);
    process.exit(1);
  }
})();

// Ethers.js Configuration (v6)
export const provider = new ethers.JsonRpcProvider(env.INFURA_URL);
export const wallet = new ethers.Wallet(env.PRIVATE_KEY!, provider);

// Nitrolite SDK Initialization (commented out - using direct EIP-712 signatures instead)
// const publicClient = createPublicClient({
//   chain: sepolia,
//   transport: http(process.env.INFURA_URL)
// });

// const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
// const walletClient = createWalletClient({
//   account,
//   chain: sepolia,
//   transport: http(process.env.INFURA_URL)
// });

// const config: NitroliteClientConfig = {
//   publicClient,
//   walletClient,
//   addresses: {
//     guestAddress: process.env.CONTRACT_ADDRESS as `0x${string}`,
//     custody: process.env.CONTRACT_ADDRESS as `0x${string}`,
//     adjudicator: process.env.CONTRACT_ADDRESS as `0x${string}`
//   },
//   chainId: sepolia.id,
//   challengeDuration: 3600n
// };

// export const nitro = new NitroliteClient(config);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/auctions', auctionRoutes);
app.use('/api', bidRoutes);

// WebSocket Server for real-time bid updates
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  console.log('WebSocket client connected');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('Received WebSocket message:', data);
      
      // Handle different message types
      if (data.type === 'subscribe' && data.auctionId) {
        // Subscribe to auction updates
        ws.send(JSON.stringify({
          type: 'subscribed',
          auctionId: data.auctionId
        }));
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

// Store WebSocket server reference for use in other modules
app.set('wss', wss);

// Global Error Handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Start Server
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`WebSocket server ready for connections`);
});
