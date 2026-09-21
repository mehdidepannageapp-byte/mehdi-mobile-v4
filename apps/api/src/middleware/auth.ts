import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

type TokenPayload = { userId: string; role: 'CLIENT' | 'DRIVER' };
type SignedTokenPayload = TokenPayload & { type: 'access' | 'refresh' };

// Jeton d'accès volontairement court : le rafraîchissement automatique (voir POST /auth/refresh)
// garde l'utilisateur connecté sans reconnexion manuelle plus fréquente qu'avant.
const ACCESS_TOKEN_TTL = '2h';
const REFRESH_TOKEN_TTL = '30d';
const refreshSecret = env.JWT_REFRESH_SECRET ?? `${env.JWT_SECRET}:refresh`;

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Authentification requise' });
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as SignedTokenPayload;
    if (payload.type !== 'access') throw new Error('Type de jeton invalide');
    req.auth = { userId: payload.userId, role: payload.role };
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
  return jwt.sign({ ...payload, type: 'access' } satisfies SignedTokenPayload, env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

export function signRefreshToken(payload: TokenPayload) {
  return jwt.sign({ ...payload, type: 'refresh' } satisfies SignedTokenPayload, refreshSecret, { expiresIn: REFRESH_TOKEN_TTL });
}

export function verifyRefreshToken(token: string): TokenPayload {
  const payload = jwt.verify(token, refreshSecret) as SignedTokenPayload;
  if (payload.type !== 'refresh') throw new Error('Type de jeton invalide');
  return { userId: payload.userId, role: payload.role };
}
