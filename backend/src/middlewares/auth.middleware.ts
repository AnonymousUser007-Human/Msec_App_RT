import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt.js";

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentification requise" });
    return;
  }
  const token = header.slice("Bearer ".length).trim();
  try {
    const { sub } = verifyAccessToken(token);
    req.user = { id: sub };
    next();
  } catch {
    res.status(401).json({ error: "Token invalide ou expiré" });
  }
}
