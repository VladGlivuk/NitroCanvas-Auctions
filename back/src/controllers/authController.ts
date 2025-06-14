import express from "express";
import { Pool } from "pg";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { env } from "../config/env.ts";
// import { User } from "../models/user.model.ts"; // TODO
import { ethers } from "ethers";
import type { Request, Response, NextFunction } from "express";

export interface User {
  id: string;
  wallet_address: string;
  username: string;
  created_at: Date;
}

const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { wallet_address, signature, message } = req.body;

  try {
    const provider = new ethers.JsonRpcProvider(env.INFURA_URL);
    const signerAddr = ethers.verifyMessage(message, signature);
    if (signerAddr.toLowerCase() !== wallet_address.toLowerCase()) {
      return res.status(401).json({ message: "Invalid signature" });
    }

    let user: User | undefined;
    const result = await pool.query(
      "SELECT id, wallet_address, username, created_at FROM users WHERE wallet_address = $1",
      [wallet_address]
    );
    if (result.rows.length > 0) {
      user = result.rows[0] as User;
    } else {
      const username = `user_${wallet_address.slice(0, 6)}`;
      const newUser = await pool.query(
        "INSERT INTO users (id, wallet_address, username, created_at) VALUES ($1, $2, $3, $4) RETURNING id, wallet_address, username, created_at",
        [uuidv4(), wallet_address, username, new Date()]
      );
      user = newUser.rows[0] as User;
    }

    const token = jwt.sign({ wallet_address }, env.JWT_SECRET, {
      expiresIn: "1h",
    });
    res.json({ token, user });
  } catch (error) {
    console.error("Login error:", error);
    next(error);
  }
};
