import { BookingStatus, UserRole } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { requireAuth, requireDriver } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

export const driverRouter = Router();
driverRouter.use(requireAuth, requireDriver);

driverRouter.patch('/availability', asyncHandler(async (req, res) => {
  const { available } = z.object({ available: z.boolean() }).parse(req.body);
  res.json(await prisma.user.update({ where: { id: req.auth!.userId }, data: { isAvailable: available } }));
}));

driverRouter.get('/dashboard', asyncHandler(async (req, res) => {
  const [user, active, completed] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } }),
    prisma.booking.findFirst({ where: { driverId: req.auth!.userId, status: { notIn: [BookingStatus.COMPLETED, BookingStatus.CANCELLED] } }, include: { client: true, vehicle: true }, orderBy: { updatedAt: 'desc' } }),
    prisma.booking.findMany({ where: { driverId: req.auth!.userId, status: BookingStatus.COMPLETED }, orderBy: { completedAt: 'desc' }, take: 100 }),
  ]);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthRevenueCents = completed.filter((b) => b.completedAt && b.completedAt >= monthStart).reduce((sum, b) => sum + (b.finalPriceCents ?? b.estimatedPriceCents), 0);
  res.json({ user, active, stats: { completedCount: completed.length, monthRevenueCents, totalRevenueCents: completed.reduce((sum, b) => sum + (b.finalPriceCents ?? b.estimatedPriceCents), 0) } });
}));

driverRouter.get('/pending', asyncHandler(async (req, res) => {
  if (req.auth!.role !== UserRole.DRIVER) return res.status(403).end();
  res.json(await prisma.booking.findFirst({ where: { driverId: req.auth!.userId, status: BookingStatus.ASSIGNED }, include: { client: true, vehicle: true }, orderBy: { updatedAt: 'desc' } }));
}));
