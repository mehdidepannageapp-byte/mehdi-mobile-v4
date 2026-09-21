import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

export const garagesRouter = Router();
garagesRouter.use(requireAuth);

// Liste publique (aux utilisateurs authentifiés) des garages partenaires actifs, proposés comme
// destination de transport. Le client garde la possibilité de saisir une autre adresse libre.
garagesRouter.get('/', asyncHandler(async (_req, res) => {
  res.json(await prisma.garage.findMany({ where: { active: true }, orderBy: { order: 'asc' } }));
}));
