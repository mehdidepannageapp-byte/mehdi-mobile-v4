import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger.js';

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  logger.error({ err: error }, 'Erreur non gérée sur une requête');
  if (error instanceof ZodError) {
    return res.status(400).json({ error: 'Données invalides', details: error.flatten() });
  }
  const message = error instanceof Error ? error.message : 'Erreur interne';
  return res.status(500).json({ error: message });
}
