import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  INFURA_URL: z.string().url(),
  PRIVATE_KEY: z.string().min(1),
  CONTRACT_ADDRESS: z.string().min(1),
  MARKETPLACE_CONTRACT_ADDRESS: z.string().min(1),
  PORT: z.string().default('3000'),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(1),
  ETHERSCAN_API_KEY: z.string().optional(),
});

const env = envSchema.parse({
  INFURA_URL: process.env.INFURA_URL,
  PRIVATE_KEY: process.env.PRIVATE_KEY,
  CONTRACT_ADDRESS: process.env.CONTRACT_ADDRESS,
  MARKETPLACE_CONTRACT_ADDRESS: process.env.MARKETPLACE_CONTRACT_ADDRESS,
  PORT: process.env.PORT,
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  ETHERSCAN_API_KEY: process.env.ETHERSCAN_API_KEY,
});

export { env };
