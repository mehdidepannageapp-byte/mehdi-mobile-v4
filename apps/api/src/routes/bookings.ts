import { BookingStatus, IssueType, PaymentMethod, PaymentStatus, PhotoKind, ServiceType, UserRole, type FinancialStatus } from '@prisma/client';
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { z } from 'zod';
import { calculatePrice, pricing, surchargeGrid } from '../config/pricing.js';
import { isInServiceArea } from '../config/service-area.js';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { assignSingleDriver } from '../services/assignment.js';
import { calculateAbsenceFeeCents, decideCancellation } from '../services/cancellation.js';
import { InvalidImageError, processUploadedImage } from '../services/image.js';
import { createInvoicePdf } from '../services/invoice.js';
import { sendPush, sendSms } from '../services/notification.js';
import { cancelAuthorization, captureAuthorization, createAuthorization, isAuthorizationReady } from '../services/payment.js';
import { calculateSurchargeAmountCents, type SurchargeCalculationInput } from '../services/surcharges.js';
import { asyncHandler } from '../utils/async-handler.js';

export const bookingsRouter = Router();
bookingsRouter.use(requireAuth);
const upload = multer({
  dest: path.resolve(process.cwd(), 'uploads'),
  limits: { fileSize: 10 * 1024 * 1024, files: 4 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

const locationSchema = z.object({
  address: z.string().min(3),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
}).refine((place) => isInServiceArea(place.latitude, place.longitude), {
  message: 'Adresse hors de la zone desservie en Île-de-France',
});
// B12 : la réparation sur place n'est proposée que pour les pannes qui peuvent se résoudre sans
// transporter la moto (§2.1). Pour tout le reste, ou si le dépanneur constate sur place que la
// réparation n'est pas possible, la mission passe (ou reste) en transport — voir POST /:id/convert-to-transport.
const ON_SITE_REPAIR_ISSUES: IssueType[] = [IssueType.BATTERY, IssueType.FLAT_TIRE, IssueType.CHAIN];

const bookingBaseSchema = z.object({
  issueType: z.nativeEnum(IssueType),
  serviceType: z.nativeEnum(ServiceType).default(ServiceType.TRANSPORT),
  issueDescription: z.string().max(500).optional(),
  pickup: locationSchema,
  destination: locationSchema.optional(),
  distanceKm: z.number().min(0).max(300).optional(),
  vehicleId: z.string().optional(),
  scheduledFor: z.coerce.date().optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).default(PaymentMethod.CARD),
});
const bookingSchema = bookingBaseSchema.superRefine((data, ctx) => {
  if (data.serviceType === ServiceType.TRANSPORT) {
    if (!data.destination) ctx.addIssue({ code: 'custom', message: 'Destination requise pour un transport', path: ['destination'] });
    if (data.distanceKm === undefined) ctx.addIssue({ code: 'custom', message: 'Distance requise pour un transport', path: ['distanceKm'] });
  } else if (!ON_SITE_REPAIR_ISSUES.includes(data.issueType)) {
    ctx.addIssue({ code: 'custom', message: 'Réparation sur place non proposée pour ce type de panne', path: ['serviceType'] });
  }
});

function reference() {
  return `MD-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function authorizedBooking(id: string, userId: string) {
  return prisma.booking.findFirst({
    where: { id, OR: [{ clientId: userId }, { driverId: userId }] },
    include: {
      client: true, driver: true, vehicle: true, photos: true,
      messages: { include: { sender: true }, orderBy: { createdAt: 'asc' } },
      invoice: true, review: true, incidents: { orderBy: { createdAt: 'desc' } },
      appointmentChangeRequests: { orderBy: { createdAt: 'desc' } },
      surcharges: { orderBy: { createdAt: 'desc' } },
      postPickupCancellationRequests: { orderBy: { createdAt: 'desc' } },
      contactAttempts: { orderBy: { createdAt: 'desc' } },
      absence: true,
    },
  });
}

bookingsRouter.get('/config', (_req, res) => res.json({ pricing, issues: Object.values(IssueType) }));

bookingsRouter.post('/estimate', (req, res) => {
  const data = bookingBaseSchema.pick({ issueType: true, serviceType: true, distanceKm: true, scheduledFor: true }).parse(req.body);
  const date = data.scheduledFor ?? new Date();
  const distanceKm = data.serviceType === ServiceType.ON_SITE_REPAIR ? 0 : (data.distanceKm ?? 0);
  res.json({ amountCents: calculatePrice(data.issueType, distanceKm, date), currency: 'eur', provisional: false });
});

bookingsRouter.post('/', asyncHandler(async (req, res) => {
  if (req.auth!.role !== UserRole.CLIENT) return res.status(403).json({ error: 'Compte client requis' });
  const data = bookingSchema.parse(req.body);
  const date = data.scheduledFor ?? new Date();
  const isScheduled = Boolean(data.scheduledFor && data.scheduledFor.getTime() > Date.now() + 15 * 60_000);
  const distanceKm = data.serviceType === ServiceType.TRANSPORT ? data.distanceKm! : 0;
  const booking = await prisma.booking.create({
    data: {
      reference: reference(), clientId: req.auth!.userId, vehicleId: data.vehicleId,
      issueType: data.issueType, serviceType: data.serviceType, issueDescription: data.issueDescription,
      pickupAddress: data.pickup.address, pickupLatitude: data.pickup.latitude, pickupLongitude: data.pickup.longitude,
      destinationAddress: data.destination?.address ?? null, destinationLatitude: data.destination?.latitude ?? null, destinationLongitude: data.destination?.longitude ?? null,
      distanceKm: data.serviceType === ServiceType.TRANSPORT ? distanceKm : null, scheduledFor: data.scheduledFor,
      status: data.paymentMethod === PaymentMethod.CASH ? (isScheduled ? BookingStatus.SCHEDULED : BookingStatus.SEARCHING) : BookingStatus.PAYMENT_PENDING,
      paymentMethod: data.paymentMethod,
      estimatedPriceCents: calculatePrice(data.issueType, distanceKm, date),
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

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

bookingsRouter.get('/', asyncHandler(async (req, res) => {
  const where = req.auth!.role === UserRole.DRIVER ? { driverId: req.auth!.userId } : { clientId: req.auth!.userId };
  const { page, limit } = paginationSchema.parse(req.query);
  const include = { vehicle: true, client: true, driver: true, invoice: true } as const;
  const orderBy = { createdAt: 'desc' } as const;

  // Sans paramètres, on garde le comportement historique (liste complète) pour ne pas casser l'app mobile.
  if (!page && !limit) {
    return res.json(await prisma.booking.findMany({ where, include, orderBy }));
  }

  const currentPage = page ?? 1;
  const pageSize = limit ?? 20;
  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({ where, include, orderBy, skip: (currentPage - 1) * pageSize, take: pageSize }),
    prisma.booking.count({ where }),
  ]);
  res.setHeader('X-Total-Count', String(total));
  res.setHeader('X-Page', String(currentPage));
  res.setHeader('X-Limit', String(pageSize));
  res.setHeader('X-Has-More', String(currentPage * pageSize < total));
  res.json(bookings);
}));

bookingsRouter.get('/:id', asyncHandler(async (req, res) => {
  const booking = await authorizedBooking(String(req.params.id), req.auth!.userId);
  if (!booking) return res.status(404).json({ error: 'Demande introuvable' });
  res.json(booking);
}));

// Une réparation sur place n'a pas d'étape de transport (pas de chargement/livraison) : elle se
// clôture directement une fois le dépanneur sur place, sauf conversion — voir
// POST /:id/convert-to-transport, qui bascule la mission sur les transitions ci-dessous.
const transportTransitions: Partial<Record<BookingStatus, BookingStatus[]>> = {
  ASSIGNED: [BookingStatus.DRIVER_EN_ROUTE, BookingStatus.CANCELLED],
  DRIVER_EN_ROUTE: [BookingStatus.DRIVER_ARRIVED],
  DRIVER_ARRIVED: [BookingStatus.PICKED_UP],
  PICKED_UP: [BookingStatus.IN_TRANSIT],
  IN_TRANSIT: [BookingStatus.DELIVERED],
  DELIVERED: [BookingStatus.COMPLETED],
};
const onSiteRepairTransitions: Partial<Record<BookingStatus, BookingStatus[]>> = {
  ASSIGNED: [BookingStatus.DRIVER_EN_ROUTE, BookingStatus.CANCELLED],
  DRIVER_EN_ROUTE: [BookingStatus.DRIVER_ARRIVED],
  DRIVER_ARRIVED: [BookingStatus.COMPLETED],
};

bookingsRouter.patch('/:id/status', asyncHandler(async (req, res) => {
  if (req.auth!.role !== UserRole.DRIVER) return res.status(403).json({ error: 'Compte dépanneur requis' });
  const { status, cashReceived } = z.object({ status: z.nativeEnum(BookingStatus), cashReceived: z.boolean().optional() }).parse(req.body);
  const booking = await authorizedBooking(String(req.params.id), req.auth!.userId);
  if (!booking) return res.status(404).json({ error: 'Demande introuvable' });
  const transitions = booking.serviceType === ServiceType.ON_SITE_REPAIR ? onSiteRepairTransitions : transportTransitions;
  const allowed = transitions[booking.status] ?? [];
  if (!allowed.includes(status)) return res.status(409).json({ error: `Transition ${booking.status} → ${status} impossible` });
  if (status === BookingStatus.COMPLETED && booking.paymentMethod === PaymentMethod.CASH && cashReceived !== true) return res.status(409).json({ error: 'Confirmez la réception du paiement en espèces' });
  // B07 : une photo de livraison est obligatoire avant de clôturer une mission de transport
  // (une réparation sur place n'a pas d'étape de livraison).
  if (status === BookingStatus.COMPLETED && booking.serviceType === ServiceType.TRANSPORT) {
    const deliveryPhotoCount = await prisma.photo.count({ where: { bookingId: booking.id, kind: PhotoKind.DELIVERY } });
    if (deliveryPhotoCount === 0) return res.status(409).json({ error: 'Au moins une photo de livraison est requise avant de clôturer la mission' });
  }
  const finalAmount = booking.finalPriceCents ?? booking.estimatedPriceCents;
  const updated = await prisma.booking.update({ where: { id: booking.id }, data: { status, ...(status === BookingStatus.COMPLETED ? { completedAt: new Date(), finalPriceCents: finalAmount, paymentStatus: PaymentStatus.PAID } : {}) } });
  // B01 : la facture doit être créée à toute clôture payée, quel que soit le moyen de paiement.
  // prisma.invoice.upsert est idempotent (bookingId unique) : pas de double facture en cas de retry.
  if (status === BookingStatus.COMPLETED) {
    if (booking.stripePaymentIntentId) await captureAuthorization(booking.stripePaymentIntentId, finalAmount);
    await prisma.invoice.upsert({ where: { bookingId: booking.id }, update: { amountCents: finalAmount }, create: { bookingId: booking.id, amountCents: finalAmount, number: `F-${new Date().getFullYear()}-${booking.reference.slice(-6)}` } });
  }
  const recipient = req.auth!.role === UserRole.DRIVER ? booking.client : booking.driver;
  await sendPush(recipient, 'Intervention mise à jour', status.replaceAll('_', ' '), { bookingId: booking.id });
  res.json(updated);
}));

// Un seul dépanneur existe : un refus ne relance pas de recherche automatique. Le dépanneur propose
// à la place un créneau ferme (30 min / 1h / 1h30), que le client devra accepter ou refuser. Ce même
// endpoint sert aussi à formaliser une proposition après un conflit d'horaire (voir GET
// /driver/conflicts) : dans ce cas la demande n'est pas encore assignée (SEARCHING/SCHEDULED,
// driverId nul), le dépanneur ayant simplement lu la réponse du client dans le chat.
bookingsRouter.post('/:id/refuse', asyncHandler(async (req, res) => {
  if (req.auth!.role !== UserRole.DRIVER) return res.status(403).end();
  const { delayMinutes } = z.object({ delayMinutes: z.union([z.literal(30), z.literal(60), z.literal(90)]) }).parse(req.body);
  const booking = await prisma.booking.findUnique({ where: { id: String(req.params.id) } });
  const eligible = Boolean(booking) && (
    (booking!.status === BookingStatus.ASSIGNED && booking!.driverId === req.auth!.userId)
    || ((booking!.status === BookingStatus.SEARCHING || booking!.status === BookingStatus.SCHEDULED) && !booking!.driverId)
  );
  if (!eligible) return res.status(409).json({ error: 'Mission non refusable' });
  const proposedFor = new Date(Date.now() + delayMinutes * 60_000);
  const updated = await prisma.booking.update({
    where: { id: booking!.id },
    data: { driverId: req.auth!.userId, status: BookingStatus.PROPOSED, proposedFor, retryAfter: null },
  });
  res.json(updated);
}));

// Le client accepte le créneau proposé : la réservation devient un rendez-vous ferme.
// Un refus du créneau se fait via POST /:id/cancel (aucune nouvelle recherche automatique).
bookingsRouter.post('/:id/proposal/accept', asyncHandler(async (req, res) => {
  const booking = await authorizedBooking(String(req.params.id), req.auth!.userId);
  if (!booking || booking.clientId !== req.auth!.userId || booking.status !== BookingStatus.PROPOSED || !booking.proposedFor) {
    return res.status(409).json({ error: 'Aucune proposition à accepter' });
  }
  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: { status: BookingStatus.SCHEDULED, scheduledFor: booking.proposedFor, proposedFor: null },
  });
  res.json(updated);
}));

const POST_PICKUP_STATUSES: BookingStatus[] = [BookingStatus.PICKED_UP, BookingStatus.IN_TRANSIT, BookingStatus.DELIVERED];

// B02 : applique les règles d'annulation du §2.6 (gratuite à l'avance, 50% le jour même par
// carte, gratuite le jour même en espèces), calculées côté serveur uniquement (jamais depuis le
// mobile). Après prise en charge, le client ne peut plus annuler directement — voir
// POST /:id/post-pickup-cancellation pour la demande soumise au dépanneur.
bookingsRouter.post('/:id/cancel', asyncHandler(async (req, res) => {
  const { reason } = z.object({ reason: z.string().max(250).optional() }).parse(req.body);
  const booking = await authorizedBooking(String(req.params.id), req.auth!.userId);
  if (!booking) return res.status(404).json({ error: 'Demande introuvable' });
  if (booking.status === BookingStatus.COMPLETED || booking.status === BookingStatus.CANCELLED) {
    return res.status(409).json({ error: 'Cette demande ne peut plus être annulée' });
  }
  if (req.auth!.role === UserRole.CLIENT && POST_PICKUP_STATUSES.includes(booking.status)) {
    return res.status(409).json({ error: 'La moto a déjà été prise en charge : soumettez une demande au dépanneur' });
  }

  // Idempotence : un deuxième clic ne recalcule ni ne facture une seconde fois.
  const existingRecord = await prisma.cancellationRecord.findUnique({ where: { bookingId: booking.id } });
  if (existingRecord) {
    return res.json(await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } }));
  }

  const decision = decideCancellation({
    scheduledFor: booking.scheduledFor,
    paymentMethod: booking.paymentMethod,
    acceptedAmountCents: booking.estimatedPriceCents,
  });
  // Rien n'a jamais été préautorisé (ex. annulation avant même l'étape de paiement carte) :
  // il n'y a rien à facturer, quelle que soit la règle calculée.
  const feeCents = booking.stripePaymentIntentId ? decision.feeCents : 0;

  let financialStatus: FinancialStatus = 'NOT_APPLICABLE';
  if (booking.stripePaymentIntentId) {
    if (feeCents > 0) {
      await captureAuthorization(booking.stripePaymentIntentId, feeCents);
      financialStatus = 'CAPTURED';
    } else {
      await cancelAuthorization(booking.stripePaymentIntentId);
      financialStatus = 'RELEASED';
    }
  }

  await prisma.$transaction([
    prisma.booking.update({
      where: { id: booking.id },
      data: { status: BookingStatus.CANCELLED, cancellationReason: reason, ...(feeCents > 0 ? { finalPriceCents: feeCents, paymentStatus: PaymentStatus.PAID } : {}) },
    }),
    prisma.cancellationRecord.create({
      data: { bookingId: booking.id, initiatedById: req.auth!.userId, rule: decision.rule, basisAmountCents: decision.basisAmountCents, feeCents, financialStatus, reason },
    }),
  ]);
  res.json(await prisma.booking.findUniqueOrThrow({ where: { id: booking.id }, include: { cancellationRecord: true } }));
}));

// B03 : incident réellement persisté (remplace l'alerte locale factice côté mobile).
bookingsRouter.post('/:id/incidents', asyncHandler(async (req, res) => {
  const { type, description } = z.object({ type: z.string().trim().min(1).max(100), description: z.string().trim().max(1000).optional() }).parse(req.body);
  const booking = await authorizedBooking(String(req.params.id), req.auth!.userId);
  if (!booking) return res.status(404).json({ error: 'Demande introuvable' });
  const incident = await prisma.incident.create({ data: { bookingId: booking.id, type, description, authorId: req.auth!.userId } });
  const recipient = req.auth!.role === UserRole.DRIVER ? booking.client : booking.driver;
  await sendPush(recipient, 'Incident signalé', type, { bookingId: booking.id });
  res.status(201).json(incident);
}));

// B12 : le dépanneur constate sur place que la réparation n'est pas possible et bascule la
// mission vers un transport, avec une nouvelle destination et un prix recalculé. Historisé via
// MissionEvent pour la traçabilité support (§5).
bookingsRouter.post('/:id/convert-to-transport', asyncHandler(async (req, res) => {
  if (req.auth!.role !== UserRole.DRIVER) return res.status(403).end();
  const { destination, distanceKm } = z.object({ destination: locationSchema, distanceKm: z.number().min(0).max(300) }).parse(req.body);
  const booking = await authorizedBooking(String(req.params.id), req.auth!.userId);
  if (!booking || booking.driverId !== req.auth!.userId || booking.serviceType !== ServiceType.ON_SITE_REPAIR) {
    return res.status(409).json({ error: 'Conversion impossible' });
  }
  const convertibleStatuses: BookingStatus[] = [BookingStatus.ASSIGNED, BookingStatus.DRIVER_EN_ROUTE, BookingStatus.DRIVER_ARRIVED];
  if (!convertibleStatuses.includes(booking.status)) return res.status(409).json({ error: 'Conversion impossible à ce stade' });
  const date = booking.scheduledFor ?? new Date();
  const estimatedPriceCents = calculatePrice(booking.issueType, distanceKm, date);
  const [updated] = await prisma.$transaction([
    prisma.booking.update({
      where: { id: booking.id },
      data: { serviceType: ServiceType.TRANSPORT, destinationAddress: destination.address, destinationLatitude: destination.latitude, destinationLongitude: destination.longitude, distanceKm, estimatedPriceCents },
    }),
    prisma.missionEvent.create({ data: { bookingId: booking.id, type: 'SERVICE_TYPE_CONVERTED', authorId: req.auth!.userId, payload: { from: 'ON_SITE_REPAIR', to: 'TRANSPORT', estimatedPriceCents } } }),
  ]);
  await sendPush(booking.client, 'Transport nécessaire', 'La réparation sur place n’est pas possible : votre moto va être transportée.', { bookingId: booking.id });
  res.json(updated);
}));

// Modification de rendez-vous (§2.x) : le client propose un nouveau créneau pour une mission
// programmée, l'ancien créneau reste valide tant que le dépanneur n'a pas tranché.
bookingsRouter.post('/:id/appointment-change', asyncHandler(async (req, res) => {
  const { proposedFor } = z.object({ proposedFor: z.coerce.date() }).parse(req.body);
  const booking = await authorizedBooking(String(req.params.id), req.auth!.userId);
  if (!booking || booking.clientId !== req.auth!.userId || booking.status !== BookingStatus.SCHEDULED) {
    return res.status(409).json({ error: 'Modification de rendez-vous impossible' });
  }
  const pending = await prisma.appointmentChangeRequest.findFirst({ where: { bookingId: booking.id, status: 'PENDING' } });
  if (pending) return res.status(409).json({ error: 'Une demande est déjà en attente' });
  const request = await prisma.appointmentChangeRequest.create({
    data: { bookingId: booking.id, previousScheduledFor: booking.scheduledFor, proposedFor, requestedById: req.auth!.userId },
  });
  await sendPush(booking.driver, 'Nouvelle demande de rendez-vous', 'Le client propose un nouveau créneau', { bookingId: booking.id });
  res.status(201).json(request);
}));

// Comme POST /:id/refuse : une demande de modification porte sur une mission SCHEDULED, donc
// pas encore assignée à un dépanneur (driverId nul tant que l'assignation automatique n'a pas eu
// lieu). authorizedBooking() ne peut donc pas servir ici — même schéma d'éligibilité que /refuse.
bookingsRouter.post('/:id/appointment-change/:changeId/accept', asyncHandler(async (req, res) => {
  if (req.auth!.role !== UserRole.DRIVER) return res.status(403).end();
  const booking = await prisma.booking.findUnique({ where: { id: String(req.params.id) }, include: { client: true, driver: true } });
  const eligible = Boolean(booking) && (booking!.driverId === req.auth!.userId || !booking!.driverId);
  if (!eligible) return res.status(404).json({ error: 'Demande introuvable' });
  const change = await prisma.appointmentChangeRequest.findFirst({ where: { id: String(req.params.changeId), bookingId: booking!.id, status: 'PENDING' } });
  if (!change) return res.status(409).json({ error: 'Demande introuvable ou déjà traitée' });
  const [, updatedBooking] = await prisma.$transaction([
    prisma.appointmentChangeRequest.update({ where: { id: change.id }, data: { status: 'ACCEPTED', decidedById: req.auth!.userId, decidedAt: new Date() } }),
    prisma.booking.update({ where: { id: booking!.id }, data: { scheduledFor: change.proposedFor } }),
  ]);
  await sendPush(booking!.client, 'Rendez-vous modifié', 'Le nouveau créneau a été accepté', { bookingId: booking!.id });
  res.json(updatedBooking);
}));

bookingsRouter.post('/:id/appointment-change/:changeId/reject', asyncHandler(async (req, res) => {
  if (req.auth!.role !== UserRole.DRIVER) return res.status(403).end();
  const booking = await prisma.booking.findUnique({ where: { id: String(req.params.id) }, include: { client: true, driver: true } });
  const eligible = Boolean(booking) && (booking!.driverId === req.auth!.userId || !booking!.driverId);
  if (!eligible) return res.status(404).json({ error: 'Demande introuvable' });
  const change = await prisma.appointmentChangeRequest.findFirst({ where: { id: String(req.params.changeId), bookingId: booking!.id, status: 'PENDING' } });
  if (!change) return res.status(409).json({ error: 'Demande introuvable ou déjà traitée' });
  const updated = await prisma.appointmentChangeRequest.update({ where: { id: change.id }, data: { status: 'REJECTED', decidedById: req.auth!.userId, decidedAt: new Date() } });
  await sendPush(booking!.client, 'Rendez-vous inchangé', 'Le dépanneur a refusé le nouveau créneau proposé', { bookingId: booking!.id });
  res.json(updated);
}));

// Supplément appliqué par le dépanneur, strictement issu de la grille tarifaire (config/pricing.ts).
bookingsRouter.post('/:id/surcharges', asyncHandler(async (req, res) => {
  if (req.auth!.role !== UserRole.DRIVER) return res.status(403).end();
  const input = z.discriminatedUnion('category', [
    z.object({ category: z.literal('DESTINATION_CHANGE') }),
    z.object({ category: z.literal('EXTRA_DISTANCE'), extraKm: z.number().min(0).max(300) }),
    z.object({ category: z.enum(['NIGHT', 'SUNDAY', 'HOLIDAY']) }),
  ]).parse(req.body);
  const booking = await authorizedBooking(String(req.params.id), req.auth!.userId);
  if (!booking || booking.driverId !== req.auth!.userId) return res.status(404).json({ error: 'Demande introuvable' });
  if (booking.status === BookingStatus.COMPLETED || booking.status === BookingStatus.CANCELLED) return res.status(409).json({ error: 'Mission déjà clôturée' });
  const calcInput: SurchargeCalculationInput = input.category === 'EXTRA_DISTANCE'
    ? { category: 'EXTRA_DISTANCE', extraKm: input.extraKm }
    : input.category === 'DESTINATION_CHANGE'
    ? { category: 'DESTINATION_CHANGE' }
    : { category: input.category, baseAmountCents: booking.estimatedPriceCents };
  const amountCents = calculateSurchargeAmountCents(calcInput);
  const previousTotalCents = booking.estimatedPriceCents;
  const newTotalCents = previousTotalCents + amountCents;
  const [surcharge] = await prisma.$transaction([
    prisma.surcharge.create({ data: { bookingId: booking.id, category: input.category, amountCents, gridVersion: surchargeGrid.version, authorId: req.auth!.userId, previousTotalCents, newTotalCents } }),
    prisma.booking.update({ where: { id: booking.id }, data: { estimatedPriceCents: newTotalCents } }),
  ]);
  await sendPush(booking.client, 'Supplément appliqué', `+${(amountCents / 100).toFixed(2)} €`, { bookingId: booking.id });
  res.status(201).json(surcharge);
}));

// Tentative de contact avant déclaration d'absence (§2.x) : trace l'appel/message pour l'audit.
bookingsRouter.post('/:id/contact-attempts', asyncHandler(async (req, res) => {
  if (req.auth!.role !== UserRole.DRIVER) return res.status(403).end();
  const { method, note } = z.object({ method: z.enum(['CALL', 'MESSAGE']), note: z.string().trim().max(300).optional() }).parse(req.body);
  const booking = await authorizedBooking(String(req.params.id), req.auth!.userId);
  if (!booking || booking.driverId !== req.auth!.userId) return res.status(404).json({ error: 'Demande introuvable' });
  const attempt = await prisma.contactAttempt.create({ data: { bookingId: booking.id, method, authorId: req.auth!.userId, note } });
  res.status(201).json(attempt);
}));

// Déclaration d'absence du client : frais de 50% du devis accepté (config/pricing.ts), calculés
// côté serveur. Idempotent (ClientAbsence.bookingId unique).
bookingsRouter.post('/:id/absence', asyncHandler(async (req, res) => {
  if (req.auth!.role !== UserRole.DRIVER) return res.status(403).end();
  const { reason } = z.object({ reason: z.string().trim().min(1).max(300) }).parse(req.body);
  const booking = await authorizedBooking(String(req.params.id), req.auth!.userId);
  if (!booking || booking.driverId !== req.auth!.userId) return res.status(404).json({ error: 'Demande introuvable' });
  if (booking.status !== BookingStatus.DRIVER_ARRIVED) return res.status(409).json({ error: 'L’absence ne peut être déclarée qu’une fois le dépanneur sur place' });
  const existing = await prisma.clientAbsence.findUnique({ where: { bookingId: booking.id } });
  if (existing) return res.json(await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } }));
  const feeCents = calculateAbsenceFeeCents(booking.estimatedPriceCents);
  if (booking.stripePaymentIntentId) await captureAuthorization(booking.stripePaymentIntentId, feeCents);
  await prisma.$transaction([
    prisma.clientAbsence.create({ data: { bookingId: booking.id, declaredById: req.auth!.userId, reason, feeCents } }),
    prisma.booking.update({
      where: { id: booking.id },
      data: { status: BookingStatus.CANCELLED, finalPriceCents: feeCents, cancellationReason: `Client absent : ${reason}`, ...(booking.stripePaymentIntentId ? { paymentStatus: PaymentStatus.PAID } : {}) },
    }),
  ]);
  await sendPush(booking.client, 'Absence constatée', 'Des frais de 50% du devis ont été appliqués faute de présence lors du passage du dépanneur.', { bookingId: booking.id });
  res.json(await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } }));
}));

// Après chargement de la moto, le client ne peut plus annuler directement (voir POST /:id/cancel) :
// il soumet une demande que le dépanneur accepte (avec une nouvelle destination, facturée via la
// grille) ou refuse.
bookingsRouter.post('/:id/post-pickup-cancellation', asyncHandler(async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().max(300).optional() }).parse(req.body);
  const booking = await authorizedBooking(String(req.params.id), req.auth!.userId);
  if (!booking || booking.clientId !== req.auth!.userId || !POST_PICKUP_STATUSES.includes(booking.status)) {
    return res.status(409).json({ error: 'Demande impossible à ce stade' });
  }
  const pending = await prisma.postPickupCancellationRequest.findFirst({ where: { bookingId: booking.id, status: 'PENDING' } });
  if (pending) return res.status(409).json({ error: 'Une demande est déjà en attente' });
  const request = await prisma.postPickupCancellationRequest.create({ data: { bookingId: booking.id, requestedById: req.auth!.userId, reason } });
  await sendPush(booking.driver, 'Demande du client', 'Le client souhaite annuler après la prise en charge', { bookingId: booking.id });
  res.status(201).json(request);
}));

bookingsRouter.post('/:id/post-pickup-cancellation/:requestId/accept', asyncHandler(async (req, res) => {
  if (req.auth!.role !== UserRole.DRIVER) return res.status(403).end();
  const { destination } = z.object({ destination: locationSchema }).parse(req.body);
  const booking = await authorizedBooking(String(req.params.id), req.auth!.userId);
  if (!booking || booking.driverId !== req.auth!.userId) return res.status(404).json({ error: 'Demande introuvable' });
  const request = await prisma.postPickupCancellationRequest.findFirst({ where: { id: String(req.params.requestId), bookingId: booking.id, status: 'PENDING' } });
  if (!request) return res.status(409).json({ error: 'Demande introuvable ou déjà traitée' });
  const previousTotalCents = booking.estimatedPriceCents;
  const amountCents = calculateSurchargeAmountCents({ category: 'DESTINATION_CHANGE' });
  const newTotalCents = previousTotalCents + amountCents;
  await prisma.$transaction([
    prisma.postPickupCancellationRequest.update({
      where: { id: request.id },
      data: { status: 'ACCEPTED', decidedById: req.auth!.userId, decidedAt: new Date(), newDestinationAddress: destination.address, newDestinationLatitude: destination.latitude, newDestinationLongitude: destination.longitude },
    }),
    prisma.booking.update({ where: { id: booking.id }, data: { destinationAddress: destination.address, destinationLatitude: destination.latitude, destinationLongitude: destination.longitude, estimatedPriceCents: newTotalCents } }),
    prisma.surcharge.create({ data: { bookingId: booking.id, category: 'DESTINATION_CHANGE', amountCents, gridVersion: surchargeGrid.version, authorId: req.auth!.userId, previousTotalCents, newTotalCents } }),
  ]);
  await sendPush(booking.client, 'Nouvelle destination confirmée', destination.address, { bookingId: booking.id });
  res.json(await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } }));
}));

bookingsRouter.post('/:id/post-pickup-cancellation/:requestId/reject', asyncHandler(async (req, res) => {
  if (req.auth!.role !== UserRole.DRIVER) return res.status(403).end();
  const booking = await authorizedBooking(String(req.params.id), req.auth!.userId);
  if (!booking || booking.driverId !== req.auth!.userId) return res.status(404).json({ error: 'Demande introuvable' });
  const request = await prisma.postPickupCancellationRequest.findFirst({ where: { id: String(req.params.requestId), bookingId: booking.id, status: 'PENDING' } });
  if (!request) return res.status(409).json({ error: 'Demande introuvable ou déjà traitée' });
  const updated = await prisma.postPickupCancellationRequest.update({ where: { id: request.id }, data: { status: 'REJECTED', decidedById: req.auth!.userId, decidedAt: new Date() } });
  await sendPush(booking.client, 'Demande refusée', 'Le dépanneur poursuit la livraison prévue', { bookingId: booking.id });
  res.json(updated);
}));

// Bascule espèces → carte quand le client n'a pas assez d'espèces sur place : le paiement se
// termine dans l'application, la clôture de mission (PATCH /:id/status) capture alors la carte
// exactement comme une mission réglée par carte dès le départ.
bookingsRouter.post('/:id/payment-fallback', asyncHandler(async (req, res) => {
  const booking = await authorizedBooking(String(req.params.id), req.auth!.userId);
  if (!booking || booking.clientId !== req.auth!.userId) return res.status(404).json({ error: 'Demande introuvable' });
  if (booking.paymentMethod !== PaymentMethod.CASH) return res.status(409).json({ error: 'Cette demande est déjà réglée par carte' });
  if (booking.status === BookingStatus.COMPLETED || booking.status === BookingStatus.CANCELLED) return res.status(409).json({ error: 'Mission déjà clôturée' });
  const amount = booking.finalPriceCents ?? booking.estimatedPriceCents;
  const payment = await createAuthorization(amount, booking.id);
  await prisma.booking.update({ where: { id: booking.id }, data: { paymentMethod: PaymentMethod.CARD, stripePaymentIntentId: payment.id, paymentStatus: PaymentStatus.PENDING } });
  res.json({ clientSecret: payment.clientSecret });
}));

bookingsRouter.post('/:id/payment-fallback/confirmed', asyncHandler(async (req, res) => {
  const booking = await authorizedBooking(String(req.params.id), req.auth!.userId);
  if (!booking || booking.clientId !== req.auth!.userId || !booking.stripePaymentIntentId) return res.status(404).json({ error: 'Paiement introuvable' });
  if (!(await isAuthorizationReady(booking.stripePaymentIntentId))) return res.status(409).json({ error: 'Le paiement n’est pas encore autorisé' });
  const updated = await prisma.booking.update({ where: { id: booking.id }, data: { paymentStatus: PaymentStatus.AUTHORIZED } });
  res.json(updated);
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
  let filename: string;
  try {
    filename = await processUploadedImage(req.file.path);
  } catch (error) {
    if (error instanceof InvalidImageError) return res.status(400).json({ error: error.message });
    throw error;
  }
  const url = `/uploads/${filename}`;
  res.status(201).json(await prisma.photo.create({ data: { bookingId: booking.id, kind, url } }));
}));

bookingsRouter.post('/:id/messages', asyncHandler(async (req, res) => {
  const { body } = z.object({ body: z.string().trim().min(1).max(1000) }).parse(req.body);
  const booking = await authorizedBooking(String(req.params.id), req.auth!.userId);
  if (!booking) return res.status(404).json({ error: 'Demande introuvable' });
  res.status(201).json(await prisma.message.create({ data: { bookingId: booking.id, senderId: req.auth!.userId, body }, include: { sender: true } }));
}));

// B09 : commentaire saisi librement côté mobile ; le serveur rejette proprement un doublon
// (Review.bookingId est unique) plutôt que de laisser remonter une erreur de contrainte brute.
bookingsRouter.post('/:id/review', asyncHandler(async (req, res) => {
  const { rating, comment } = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(500).optional() }).parse(req.body);
  const booking = await authorizedBooking(String(req.params.id), req.auth!.userId);
  if (!booking || booking.status !== BookingStatus.COMPLETED || !booking.driverId) return res.status(409).json({ error: 'Avis impossible' });
  if (booking.review) return res.status(409).json({ error: 'Un avis a déjà été envoyé pour cette course' });
  res.status(201).json(await prisma.review.create({ data: { bookingId: booking.id, authorId: req.auth!.userId, recipientId: booking.driverId, rating, comment } }));
}));

bookingsRouter.get('/:id/invoice.pdf', asyncHandler(async (req, res) => {
  const booking = await prisma.booking.findFirst({ where: { id: String(req.params.id), clientId: req.auth!.userId }, include: { client: true, vehicle: true, invoice: true } });
  if (!booking?.invoice) return res.status(404).json({ error: 'Facture indisponible' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${booking.invoice.number}.pdf"`);
  createInvoicePdf(booking, booking.invoice.number).pipe(res);
}));
