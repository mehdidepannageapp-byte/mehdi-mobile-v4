import { BookingStatus, IssueType, PaymentMethod, PaymentStatus, PhotoKind, UserRole } from '@prisma/client';
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { z } from 'zod';
import { calculatePrice, pricing } from '../config/pricing.js';
import { isInServiceArea } from '../config/service-area.js';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { assignSingleDriver } from '../services/assignment.js';
import { createInvoicePdf } from '../services/invoice.js';
import { sendPush, sendSms } from '../services/notification.js';
import { cancelAuthorization, captureAuthorization, createAuthorization, isAuthorizationReady } from '../services/payment.js';
import { asyncHandler } from '../utils/async-handler.js';

export const bookingsRouter = Router();
bookingsRouter.use(requireAuth);
const upload = multer({ dest: path.resolve(process.cwd(), 'uploads'), limits: { fileSize: 10 * 1024 * 1024, files: 4 } });

const locationSchema = z.object({
  address: z.string().min(3),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
}).refine((place) => isInServiceArea(place.latitude, place.longitude), {
  message: 'Adresse hors de la zone desservie en Île-de-France',
});
const bookingSchema = z.object({
  issueType: z.nativeEnum(IssueType),
  issueDescription: z.string().max(500).optional(),
  pickup: locationSchema,
  destination: locationSchema,
  distanceKm: z.number().min(0).max(300),
  vehicleId: z.string().optional(),
  scheduledFor: z.coerce.date().optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).default(PaymentMethod.CARD),
});

function reference() {
  return `MD-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function authorizedBooking(id: string, userId: string) {
  return prisma.booking.findFirst({
    where: { id, OR: [{ clientId: userId }, { driverId: userId }] },
    include: { client: true, driver: true, vehicle: true, photos: true, messages: { include: { sender: true }, orderBy: { createdAt: 'asc' } }, invoice: true, review: true },
  });
}

bookingsRouter.get('/config', (_req, res) => res.json({ pricing, issues: Object.values(IssueType) }));

bookingsRouter.post('/estimate', (req, res) => {
  const data = bookingSchema.pick({ issueType: true, distanceKm: true, scheduledFor: true }).parse(req.body);
  const date = data.scheduledFor ?? new Date();
  res.json({ amountCents: calculatePrice(data.issueType, data.distanceKm, date), currency: 'eur', provisional: true });
});

bookingsRouter.post('/', asyncHandler(async (req, res) => {
  if (req.auth!.role !== UserRole.CLIENT) return res.status(403).json({ error: 'Compte client requis' });
  const data = bookingSchema.parse(req.body);
  const date = data.scheduledFor ?? new Date();
  const isScheduled = Boolean(data.scheduledFor && data.scheduledFor.getTime() > Date.now() + 15 * 60_000);
  const booking = await prisma.booking.create({
    data: {
      reference: reference(), clientId: req.auth!.userId, vehicleId: data.vehicleId,
      issueType: data.issueType, issueDescription: data.issueDescription,
      pickupAddress: data.pickup.address, pickupLatitude: data.pickup.latitude, pickupLongitude: data.pickup.longitude,
      destinationAddress: data.destination.address, destinationLatitude: data.destination.latitude, destinationLongitude: data.destination.longitude,
      distanceKm: data.distanceKm, scheduledFor: data.scheduledFor,
      status: data.paymentMethod === PaymentMethod.CASH ? (isScheduled ? BookingStatus.SCHEDULED : BookingStatus.SEARCHING) : BookingStatus.PAYMENT_PENDING,
      paymentMethod: data.paymentMethod,
      estimatedPriceCents: calculatePrice(data.issueType, data.distanceKm, date),
    },
  });
  if (data.paymentMethod === PaymentMethod.CASH && !isScheduled) void assignSingleDriver(booking.id);
  res.status(201).json(booking);
}));

bookingsRouter.post('/:id/payment-intent', asyncHandler(async (req, res) => {
  const booking = await authorizedBooking(String(req.params.id), req.auth!.userId);
  if (!booking || booking.clientId !== req.auth!.userId) return res.status(404).json({ error: 'Demande introuvable' });
  if (booking.paymentMethod !== PaymentMethod.CARD) return res.status(409).json({ error: 'Cette demande est réglée en espèces' });
  const payment = await createAuthorization(booking.estimatedPriceCents, booking.id);
  await prisma.booking.update({ where: { id: booking.id }, data: { stripePaymentIntentId: payment.id, status: BookingStatus.PAYMENT_PENDING, paymentStatus: PaymentStatus.PENDING } });
  res.json({ clientSecret: payment.clientSecret });
}));

bookingsRouter.post('/:id/payment-confirmed', asyncHandler(async (req, res) => {
  const booking = await authorizedBooking(String(req.params.id), req.auth!.userId);
  if (!booking || booking.clientId !== req.auth!.userId || !booking.stripePaymentIntentId) return res.status(404).json({ error: 'Paiement introuvable' });
  if (!(await isAuthorizationReady(booking.stripePaymentIntentId))) return res.status(409).json({ error: 'Le paiement n’est pas encore autorisé' });
  const isScheduled = Boolean(booking.scheduledFor && booking.scheduledFor.getTime() > Date.now() + 15 * 60_000);
  const updated = await prisma.booking.update({ where: { id: booking.id }, data: { status: isScheduled ? BookingStatus.SCHEDULED : BookingStatus.SEARCHING, retryAfter: isScheduled ? null : new Date(), paymentStatus: PaymentStatus.AUTHORIZED } });
  if (!isScheduled) void assignSingleDriver(booking.id);
  res.json(updated);
}));

bookingsRouter.get('/', asyncHandler(async (req, res) => {
  const where = req.auth!.role === UserRole.DRIVER ? { driverId: req.auth!.userId } : { clientId: req.auth!.userId };
  res.json(await prisma.booking.findMany({ where, include: { vehicle: true, client: true, driver: true, invoice: true }, orderBy: { createdAt: 'desc' } }));
}));

bookingsRouter.get('/:id', asyncHandler(async (req, res) => {
  const booking = await authorizedBooking(String(req.params.id), req.auth!.userId);
  if (!booking) return res.status(404).json({ error: 'Demande introuvable' });
  res.json(booking);
}));

const transitions: Partial<Record<BookingStatus, BookingStatus[]>> = {
  ASSIGNED: [BookingStatus.DRIVER_EN_ROUTE, BookingStatus.CANCELLED],
  DRIVER_EN_ROUTE: [BookingStatus.DRIVER_ARRIVED],
  DRIVER_ARRIVED: [BookingStatus.PICKED_UP],
  PICKED_UP: [BookingStatus.IN_TRANSIT],
  IN_TRANSIT: [BookingStatus.DELIVERED],
  DELIVERED: [BookingStatus.COMPLETED],
};

bookingsRouter.patch('/:id/status', asyncHandler(async (req, res) => {
  if (req.auth!.role !== UserRole.DRIVER) return res.status(403).json({ error: 'Compte dépanneur requis' });
  const { status, cashReceived } = z.object({ status: z.nativeEnum(BookingStatus), cashReceived: z.boolean().optional() }).parse(req.body);
  const booking = await authorizedBooking(String(req.params.id), req.auth!.userId);
  if (!booking) return res.status(404).json({ error: 'Demande introuvable' });
  const allowed = transitions[booking.status] ?? [];
  if (!allowed.includes(status)) return res.status(409).json({ error: `Transition ${booking.status} → ${status} impossible` });
  if (status === BookingStatus.COMPLETED && booking.paymentMethod === PaymentMethod.CASH && cashReceived !== true) return res.status(409).json({ error: 'Confirmez la réception du paiement en espèces' });
  const finalAmount = booking.finalPriceCents ?? booking.estimatedPriceCents;
  const updated = await prisma.booking.update({ where: { id: booking.id }, data: { status, ...(status === BookingStatus.COMPLETED ? { completedAt: new Date(), finalPriceCents: finalAmount, paymentStatus: PaymentStatus.PAID } : {}) } });
  if (status === BookingStatus.COMPLETED && booking.stripePaymentIntentId) {
    await captureAuthorization(booking.stripePaymentIntentId, finalAmount);
    await prisma.invoice.upsert({ where: { bookingId: booking.id }, update: { amountCents: finalAmount }, create: { bookingId: booking.id, amountCents: finalAmount, number: `F-${new Date().getFullYear()}-${booking.reference.slice(-6)}` } });
  }
  const recipient = req.auth!.role === UserRole.DRIVER ? booking.client : booking.driver;
  await sendPush(recipient?.pushToken, 'Intervention mise à jour', status.replaceAll('_', ' '), { bookingId: booking.id });
  res.json(updated);
}));

bookingsRouter.post('/:id/refuse', asyncHandler(async (req, res) => {
  if (req.auth!.role !== UserRole.DRIVER) return res.status(403).end();
  const booking = await authorizedBooking(String(req.params.id), req.auth!.userId);
  if (!booking || booking.status !== BookingStatus.ASSIGNED) return res.status(409).json({ error: 'Mission non refusable' });
  const updated = await prisma.booking.update({ where: { id: booking.id }, data: { driverId: null, status: BookingStatus.SEARCHING, retryAfter: new Date(Date.now() + pricing.retryMinutes * 60_000) } });
  res.json(updated);
}));

bookingsRouter.post('/:id/cancel', asyncHandler(async (req, res) => {
  const { reason } = z.object({ reason: z.string().max(250).optional() }).parse(req.body);
  const booking = await authorizedBooking(String(req.params.id), req.auth!.userId);
  if (!booking) return res.status(404).json({ error: 'Demande introuvable' });
  if (booking.status === BookingStatus.COMPLETED || booking.status === BookingStatus.CANCELLED) return res.status(409).json({ error: 'Cette demande ne peut plus être annulée' });
  if (booking.stripePaymentIntentId) await cancelAuthorization(booking.stripePaymentIntentId);
  res.json(await prisma.booking.update({ where: { id: booking.id }, data: { status: BookingStatus.CANCELLED, cancellationReason: reason } }));
}));

bookingsRouter.post('/:id/photos', asyncHandler(async (req, res) => {
  const { kind, url } = z.object({ kind: z.nativeEnum(PhotoKind), url: z.string().min(1) }).parse(req.body);
  const booking = await authorizedBooking(String(req.params.id), req.auth!.userId);
  if (!booking) return res.status(404).json({ error: 'Demande introuvable' });
  res.status(201).json(await prisma.photo.create({ data: { bookingId: booking.id, kind, url } }));
}));

bookingsRouter.post('/:id/photos/upload', upload.single('photo'), asyncHandler(async (req, res) => {
  const kind = z.nativeEnum(PhotoKind).parse(req.body.kind);
  const booking = await authorizedBooking(String(req.params.id), req.auth!.userId);
  if (!booking) return res.status(404).json({ error: 'Demande introuvable' });
  if (!req.file) return res.status(400).json({ error: 'Photo manquante' });
  const url = `/uploads/${req.file.filename}`;
  res.status(201).json(await prisma.photo.create({ data: { bookingId: booking.id, kind, url } }));
}));

bookingsRouter.post('/:id/messages', asyncHandler(async (req, res) => {
  const { body } = z.object({ body: z.string().trim().min(1).max(1000) }).parse(req.body);
  const booking = await authorizedBooking(String(req.params.id), req.auth!.userId);
  if (!booking) return res.status(404).json({ error: 'Demande introuvable' });
  res.status(201).json(await prisma.message.create({ data: { bookingId: booking.id, senderId: req.auth!.userId, body }, include: { sender: true } }));
}));

bookingsRouter.post('/:id/review', asyncHandler(async (req, res) => {
  const { rating, comment } = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().max(500).optional() }).parse(req.body);
  const booking = await authorizedBooking(String(req.params.id), req.auth!.userId);
  if (!booking || booking.status !== BookingStatus.COMPLETED || !booking.driverId) return res.status(409).json({ error: 'Avis impossible' });
  res.status(201).json(await prisma.review.create({ data: { bookingId: booking.id, authorId: req.auth!.userId, recipientId: booking.driverId, rating, comment } }));
}));

bookingsRouter.get('/:id/invoice.pdf', asyncHandler(async (req, res) => {
  const booking = await prisma.booking.findFirst({ where: { id: String(req.params.id), clientId: req.auth!.userId }, include: { client: true, vehicle: true, invoice: true } });
  if (!booking?.invoice) return res.status(404).json({ error: 'Facture indisponible' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${booking.invoice.number}.pdf"`);
  createInvoicePdf(booking, booking.invoice.number).pipe(res);
}));
