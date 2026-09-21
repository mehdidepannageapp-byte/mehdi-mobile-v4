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

// Indisponibilités déclarées par le dépanneur pour des missions prises hors application.
// Ponctuel : plage startAt/endAt précise. Récurrent : jour de semaine + plage "HH:mm",
// actif jusqu'à suppression manuelle (voir aussi services/assignment.ts).
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const unavailabilitySchema = z.object({
  type: z.enum(['ONE_TIME', 'RECURRING']),
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().optional(),
  weekday: z.number().int().min(0).max(6).optional(),
  startTime: z.string().regex(timePattern, 'Heure invalide (HH:mm)').optional(),
  endTime: z.string().regex(timePattern, 'Heure invalide (HH:mm)').optional(),
}).superRefine((data, ctx) => {
  if (data.type === 'ONE_TIME') {
    if (!data.startAt || !data.endAt) ctx.addIssue({ code: 'custom', message: 'startAt et endAt requis pour un créneau ponctuel' });
    else if (data.endAt <= data.startAt) ctx.addIssue({ code: 'custom', message: 'La fin doit être après le début', path: ['endAt'] });
  } else {
    if (data.weekday === undefined || !data.startTime || !data.endTime) ctx.addIssue({ code: 'custom', message: 'weekday, startTime et endTime requis pour un créneau récurrent' });
    else if (data.endTime <= data.startTime) ctx.addIssue({ code: 'custom', message: 'La fin doit être après le début', path: ['endTime'] });
  }
});

driverRouter.get('/unavailability', asyncHandler(async (req, res) => {
  res.json(await prisma.unavailability.findMany({ where: { driverId: req.auth!.userId }, orderBy: { createdAt: 'desc' } }));
}));

driverRouter.post('/unavailability', asyncHandler(async (req, res) => {
  const data = unavailabilitySchema.parse(req.body);
  const created = await prisma.unavailability.create({
    data: {
      driverId: req.auth!.userId,
      type: data.type,
      startAt: data.type === 'ONE_TIME' ? data.startAt : null,
      endAt: data.type === 'ONE_TIME' ? data.endAt : null,
      weekday: data.type === 'RECURRING' ? data.weekday : null,
      startTime: data.type === 'RECURRING' ? data.startTime : null,
      endTime: data.type === 'RECURRING' ? data.endTime : null,
    },
  });
  res.status(201).json(created);
}));

driverRouter.delete('/unavailability/:id', asyncHandler(async (req, res) => {
  const existing = await prisma.unavailability.findFirst({ where: { id: String(req.params.id), driverId: req.auth!.userId } });
  if (!existing) return res.status(404).json({ error: 'Indisponibilité introuvable' });
  await prisma.unavailability.delete({ where: { id: existing.id } });
  res.status(204).end();
}));
