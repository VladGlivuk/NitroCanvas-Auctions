// src/middleware/auth.middleware.ts
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.ts";

declare module "express" {
  interface Request {
    user?: { wallet_address: string };
  }
}

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided" });

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as {
      walletAddress: string;
    };
    req.user = { wallet_address: decoded.walletAddress };
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
};
