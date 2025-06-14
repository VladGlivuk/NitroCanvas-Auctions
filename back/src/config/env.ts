import * as dotenv from 'dotenv';
import { cleanEnv, str, url } from 'envalid';

dotenv.config();

export const env = cleanEnv(process.env, {
  INFURA_URL: url(),
  PRIVATE_KEY: str(),
  JWT_SECRET: str(),
  DATABASE_URL: url(),
  PORT: str({ default: '3000' }),
});