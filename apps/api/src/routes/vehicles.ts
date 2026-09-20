import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

export const vehiclesRouter = Router();
vehiclesRouter.use(requireAuth);

const vehicleSchema = z.object({ brand: z.string().trim().min(1), model: z.string().trim().min(1), plate: z.string().trim().optional(), year: z.number().int().min(1950).max(2100).optional() });

vehiclesRouter.get('/', asyncHandler(async (req, res) => {
  res.json(await prisma.vehicle.findMany({ where: { ownerId: req.auth!.userId }, orderBy: { createdAt: 'desc' } }));
}));

vehiclesRouter.post('/', asyncHandler(async (req, res) => {
  const vehicle = await prisma.vehicle.create({ data: { ...vehicleSchema.parse(req.body), ownerId: req.auth!.userId } });
  res.status(201).json(vehicle);
}));

vehiclesRouter.delete('/:id', asyncHandler(async (req, res) => {
  await prisma.vehicle.deleteMany({ where: { id: String(req.params.id), ownerId: req.auth!.userId } });
  res.status(204).end();
}));
