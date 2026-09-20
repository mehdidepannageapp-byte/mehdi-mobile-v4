import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

type TokenPayload = { userId: string; role: 'CLIENT' | 'DRIVER' };

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Authentification requise' });
  try {
    req.auth = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expirée' });
  }
}

export function requireDriver(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.role !== 'DRIVER') return res.status(403).json({ error: 'Compte dépanneur requis' });
  next();
}

export function signToken(payload: TokenPayload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '30d' });
}
