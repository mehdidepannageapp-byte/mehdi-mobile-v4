import { UserRole } from '@prisma/client';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendSms } from '../services/notification.js';

export const authRouter = Router();

authRouter.post('/request-otp', asyncHandler(async (req, res) => {
  const { phone } = z.object({ phone: z.string().regex(/^\+[1-9]\d{7,14}$/) }).parse(req.body);
  const code = env.NODE_ENV === 'production' ? String(Math.floor(100000 + Math.random() * 900000)) : '000000';
  await prisma.otpCode.create({ data: { phone, codeHash: await bcrypt.hash(code, 10), expiresAt: new Date(Date.now() + 10 * 60_000) } });
  await sendSms(phone, `Votre code Mehdi Dépannage est ${code}. Il expire dans 10 minutes.`);
  res.status(204).end();
}));

authRouter.post('/verify-otp', asyncHandler(async (req, res) => {
  const { phone, code, firstName } = z.object({ phone: z.string(), code: z.string().length(6), firstName: z.string().trim().min(1).optional() }).parse(req.body);
  const otp = await prisma.otpCode.findFirst({ where: { phone, consumedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
  if (!otp || !(await bcrypt.compare(code, otp.codeHash))) return res.status(401).json({ error: 'Code incorrect ou expiré' });
  await prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
  const role = phone === env.DRIVER_PHONE ? UserRole.DRIVER : UserRole.CLIENT;
  const user = await prisma.user.upsert({ where: { phone }, update: { ...(firstName ? { firstName } : {}) }, create: { phone, firstName, role } });
  res.json({ token: signToken({ userId: user.id, role: user.role }), user });
}));

authRouter.post('/demo/:role', asyncHandler(async (req, res) => {
  if (env.NODE_ENV === 'production') return res.status(404).end();
  const role = req.params.role === 'driver' ? UserRole.DRIVER : UserRole.CLIENT;
  const phone = role === UserRole.DRIVER ? env.DRIVER_PHONE : '+33611111111';
  const user = await prisma.user.upsert({ where: { phone }, update: { role }, create: { phone, firstName: role === UserRole.DRIVER ? 'Mehdi' : 'Walid', role } });
  res.json({ token: signToken({ userId: user.id, role: user.role }), user });
}));

authRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId }, include: { vehicles: true } });
  res.json(user);
}));

authRouter.patch('/me', requireAuth, asyncHandler(async (req, res) => {
  const data = z.object({ firstName: z.string().trim().min(1).optional(), email: z.string().email().nullable().optional(), pushToken: z.string().nullable().optional() }).parse(req.body);
  const user = await prisma.user.update({ where: { id: req.auth!.userId }, data });
  res.json(user);
}));

authRouter.delete('/me', requireAuth, asyncHandler(async (req, res) => {
  if (req.auth!.role === UserRole.DRIVER) return res.status(400).json({ error: 'Le compte professionnel ne peut pas être supprimé depuis l’application' });
  await prisma.user.delete({ where: { id: req.auth!.userId } });
  res.status(204).end();
}));
