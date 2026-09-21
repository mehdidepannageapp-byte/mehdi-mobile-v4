import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  booking: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), count: vi.fn() },
  user: { findFirst: vi.fn() },
  invoice: { upsert: vi.fn() },
  photo: { create: vi.fn(), count: vi.fn() },
  cancellationRecord: { findUnique: vi.fn(), create: vi.fn() },
  incident: { create: vi.fn() },
  notificationPreference: { findUnique: vi.fn() },
  missionEvent: { create: vi.fn() },
  appointmentChangeRequest: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  surcharge: { create: vi.fn() },
  contactAttempt: { create: vi.fn() },
  clientAbsence: { findUnique: vi.fn(), create: vi.fn() },
  postPickupCancellationRequest: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
}));

vi.mock('../config/prisma.js', () => ({ prisma: prismaMock }));

const { bookingsRouter } = await import('./bookings.js');
const { errorHandler } = await import('../middleware/errors.js');
const { signToken } = await import('../middleware/auth.js');
const { BookingStatus, IssueType, PaymentMethod, PaymentStatus, ServiceType } = await import('@prisma/client');
const sharp = (await import('sharp')).default;
const { unlink } = await import('fs/promises');
const path = (await import('path')).default;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/bookings', bookingsRouter);
  app.use(errorHandler);
  return app;
}

const app = buildApp();
const clientToken = signToken({ userId: 'client-1', role: 'CLIENT' });
const driverToken = signToken({ userId: 'driver-1', role: 'DRIVER' });

const parisPickup = { address: '10 rue de Paris', latitude: 48.8566, longitude: 2.3522 };
const parisDestination = { address: '20 avenue de Paris', latitude: 48.86, longitude: 2.36 };
const cupertino = { address: 'Apple Park', latitude: 37.3349, longitude: -122.009 };

function validBookingPayload(overrides: Record<string, unknown> = {}) {
  return {
    issueType: IssueType.FLAT_TIRE,
    pickup: parisPickup,
    destination: parisDestination,
    distanceKm: 5,
    paymentMethod: PaymentMethod.CASH,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Par défaut, l'assignation automatique (fire-and-forget) ne trouve pas la course : elle ne va pas plus loin.
  prismaMock.booking.findUnique.mockResolvedValue(null);
  // Par défaut une photo de livraison existe déjà (B07 testé séparément) et aucune annulation
  // n'a encore été enregistrée (idempotence testée séparément).
  prismaMock.photo.count.mockResolvedValue(1);
  prismaMock.cancellationRecord.findUnique.mockResolvedValue(null);
  prismaMock.$transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
});

describe('POST /bookings (création)', () => {
  it('refuse la création pour un compte chauffeur avec 403', async () => {
    const res = await request(app).post('/bookings').set('Authorization', `Bearer ${driverToken}`).send(validBookingPayload());
    expect(res.status).toBe(403);
    expect(prismaMock.booking.create).not.toHaveBeenCalled();
  });

  it('refuse une adresse hors zone desservie avec 400', async () => {
    const res = await request(app).post('/bookings').set('Authorization', `Bearer ${clientToken}`)
      .send(validBookingPayload({ pickup: cupertino }));
    expect(res.status).toBe(400);
    expect(prismaMock.booking.create).not.toHaveBeenCalled();
  });

  it('crée une course en espèces immédiate au statut SEARCHING', async () => {
    prismaMock.booking.create.mockResolvedValue({ id: 'booking-1', status: BookingStatus.SEARCHING });

    const res = await request(app).post('/bookings').set('Authorization', `Bearer ${clientToken}`).send(validBookingPayload());

    expect(res.status).toBe(201);
    const data = prismaMock.booking.create.mock.calls[0][0].data;
    expect(data.status).toBe(BookingStatus.SEARCHING);
    expect(data.clientId).toBe('client-1');
  });

  it('crée une course par carte au statut PAYMENT_PENDING', async () => {
    prismaMock.booking.create.mockResolvedValue({ id: 'booking-2', status: BookingStatus.PAYMENT_PENDING });

    const res = await request(app).post('/bookings').set('Authorization', `Bearer ${clientToken}`)
      .send(validBookingPayload({ paymentMethod: PaymentMethod.CARD }));

    expect(res.status).toBe(201);
    const data = prismaMock.booking.create.mock.calls[0][0].data;
    expect(data.status).toBe(BookingStatus.PAYMENT_PENDING);
  });
});

describe('GET /bookings (liste et pagination)', () => {
  it('retourne un tableau complet sans paramètres, comme avant (compatibilité mobile)', async () => {
    prismaMock.booking.findMany.mockResolvedValue([{ id: 'b1' }, { id: 'b2' }]);

    const res = await request(app).get('/bookings').set('Authorization', `Bearer ${clientToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'b1' }, { id: 'b2' }]);
    expect(prismaMock.booking.count).not.toHaveBeenCalled();
    expect(res.headers['x-total-count']).toBeUndefined();
    const args = prismaMock.booking.findMany.mock.calls[0][0];
    expect(args.skip).toBeUndefined();
    expect(args.take).toBeUndefined();
  });

  it('applique page/limit et renvoie les métadonnées en en-têtes', async () => {
    prismaMock.booking.findMany.mockResolvedValue([{ id: 'b3' }]);
    prismaMock.booking.count.mockResolvedValue(25);

    const res = await request(app).get('/bookings?page=2&limit=10').set('Authorization', `Bearer ${clientToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'b3' }]);
    expect(res.headers['x-total-count']).toBe('25');
    expect(res.headers['x-page']).toBe('2');
    expect(res.headers['x-limit']).toBe('10');
    expect(res.headers['x-has-more']).toBe('true');
    const args = prismaMock.booking.findMany.mock.calls[0][0];
    expect(args.skip).toBe(10);
    expect(args.take).toBe(10);
  });
});

describe('GET /bookings/:id', () => {
  it("renvoie 404 quand la course n'appartient pas à l'utilisateur ou n'existe pas", async () => {
    prismaMock.booking.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/bookings/inconnue').set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(404);
  });

  it('renvoie la course quand elle est autorisée', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', clientId: 'client-1' });
    const res = await request(app).get('/bookings/booking-1').set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('booking-1');
  });
});

describe('PATCH /bookings/:id/status (transitions)', () => {
  it('refuse la mise à jour pour un compte client avec 403', async () => {
    const res = await request(app).patch('/bookings/booking-1/status').set('Authorization', `Bearer ${clientToken}`)
      .send({ status: BookingStatus.DRIVER_EN_ROUTE });
    expect(res.status).toBe(403);
  });

  it('refuse une transition non autorisée avec 409', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', status: BookingStatus.DRIVER_ARRIVED, serviceType: ServiceType.TRANSPORT, paymentMethod: PaymentMethod.CASH, estimatedPriceCents: 1000 });
    const res = await request(app).patch('/bookings/booking-1/status').set('Authorization', `Bearer ${driverToken}`)
      .send({ status: BookingStatus.DRIVER_EN_ROUTE });
    expect(res.status).toBe(409);
  });

  it('autorise une transition valide et notifie le client', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', status: BookingStatus.ASSIGNED, serviceType: ServiceType.TRANSPORT, paymentMethod: PaymentMethod.CASH, estimatedPriceCents: 1000, client: { pushToken: null } });
    prismaMock.booking.update.mockResolvedValue({ id: 'booking-1', status: BookingStatus.DRIVER_EN_ROUTE });

    const res = await request(app).patch('/bookings/booking-1/status').set('Authorization', `Bearer ${driverToken}`)
      .send({ status: BookingStatus.DRIVER_EN_ROUTE });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(BookingStatus.DRIVER_EN_ROUTE);
  });

  it('exige la confirmation du paiement en espèces pour finaliser une course CASH', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', status: BookingStatus.DELIVERED, serviceType: ServiceType.TRANSPORT, paymentMethod: PaymentMethod.CASH, estimatedPriceCents: 1000 });

    const res = await request(app).patch('/bookings/booking-1/status').set('Authorization', `Bearer ${driverToken}`)
      .send({ status: BookingStatus.COMPLETED });

    expect(res.status).toBe(409);
    expect(prismaMock.booking.update).not.toHaveBeenCalled();
  });

  it('finalise une course CASH une fois le paiement confirmé et crée la facture (B01)', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', status: BookingStatus.DELIVERED, serviceType: ServiceType.TRANSPORT, paymentMethod: PaymentMethod.CASH, estimatedPriceCents: 1000, finalPriceCents: null, reference: 'MD-2026-ABCDEF' });
    prismaMock.booking.update.mockResolvedValue({ id: 'booking-1', status: BookingStatus.COMPLETED, paymentStatus: PaymentStatus.PAID });

    const res = await request(app).patch('/bookings/booking-1/status').set('Authorization', `Bearer ${driverToken}`)
      .send({ status: BookingStatus.COMPLETED, cashReceived: true });

    expect(res.status).toBe(200);
    expect(prismaMock.booking.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: BookingStatus.COMPLETED, paymentStatus: PaymentStatus.PAID }),
    }));
    // B01 : la facture doit être créée même en espèces (pas de stripePaymentIntentId).
    expect(prismaMock.invoice.upsert).toHaveBeenCalledWith({
      where: { bookingId: 'booking-1' },
      update: { amountCents: 1000 },
      create: { bookingId: 'booking-1', amountCents: 1000, number: 'F-2026-ABCDEF' },
    });
  });

  it('refuse de clôturer sans photo de livraison (B07)', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', status: BookingStatus.DELIVERED, serviceType: ServiceType.TRANSPORT, paymentMethod: PaymentMethod.CASH, estimatedPriceCents: 1000, finalPriceCents: null, reference: 'MD-2026-ABCDEF' });
    prismaMock.photo.count.mockResolvedValue(0);

    const res = await request(app).patch('/bookings/booking-1/status').set('Authorization', `Bearer ${driverToken}`)
      .send({ status: BookingStatus.COMPLETED, cashReceived: true });

    expect(res.status).toBe(409);
    expect(prismaMock.booking.update).not.toHaveBeenCalled();
    expect(prismaMock.invoice.upsert).not.toHaveBeenCalled();
  });

  it('finalise une course carte payée par autorisation démo et crée la facture', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({
      id: 'booking-2', status: BookingStatus.DELIVERED, serviceType: ServiceType.TRANSPORT, paymentMethod: PaymentMethod.CARD,
      estimatedPriceCents: 2000, finalPriceCents: null, reference: 'MD-2026-ABCDEF', stripePaymentIntentId: 'pi_demo_booking-2',
    });
    prismaMock.booking.update.mockResolvedValue({ id: 'booking-2', status: BookingStatus.COMPLETED });
    prismaMock.invoice.upsert.mockResolvedValue({ id: 'invoice-1' });

    const res = await request(app).patch('/bookings/booking-2/status').set('Authorization', `Bearer ${driverToken}`)
      .send({ status: BookingStatus.COMPLETED });

    expect(res.status).toBe(200);
    expect(prismaMock.invoice.upsert).toHaveBeenCalledTimes(1);
  });
});

describe('POST /bookings/:id/refuse', () => {
  it('refuse pour un compte client avec 403', async () => {
    const res = await request(app).post('/bookings/booking-1/refuse').set('Authorization', `Bearer ${clientToken}`).send({ delayMinutes: 30 });
    expect(res.status).toBe(403);
  });

  it('rejette un délai qui n’est pas 30, 60 ou 90 minutes', async () => {
    const res = await request(app).post('/bookings/booking-1/refuse').set('Authorization', `Bearer ${driverToken}`).send({ delayMinutes: 45 });
    expect(res.status).toBe(400);
    expect(prismaMock.booking.update).not.toHaveBeenCalled();
  });

  it('refuse si la mission est déjà terminée ou annulée', async () => {
    prismaMock.booking.findUnique.mockResolvedValue({ id: 'booking-1', status: BookingStatus.CANCELLED, driverId: null });
    const res = await request(app).post('/bookings/booking-1/refuse').set('Authorization', `Bearer ${driverToken}`).send({ delayMinutes: 30 });
    expect(res.status).toBe(409);
  });

  it('refuse une mission SEARCHING déjà réservée à un autre dépanneur', async () => {
    prismaMock.booking.findUnique.mockResolvedValue({ id: 'booking-1', status: BookingStatus.SEARCHING, driverId: 'un-autre-driver' });
    const res = await request(app).post('/bookings/booking-1/refuse').set('Authorization', `Bearer ${driverToken}`).send({ delayMinutes: 30 });
    expect(res.status).toBe(409);
  });

  it('propose un créneau ferme et passe la course en PROPOSED, sans relancer de recherche', async () => {
    prismaMock.booking.findUnique.mockResolvedValue({ id: 'booking-1', status: BookingStatus.ASSIGNED, driverId: 'driver-1' });
    prismaMock.booking.update.mockResolvedValue({ id: 'booking-1', status: BookingStatus.PROPOSED });

    const before = Date.now();
    const res = await request(app).post('/bookings/booking-1/refuse').set('Authorization', `Bearer ${driverToken}`).send({ delayMinutes: 60 });
    const after = Date.now();

    expect(res.status).toBe(200);
    expect(prismaMock.booking.update).toHaveBeenCalledTimes(1);
    const call = prismaMock.booking.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'booking-1' });
    expect(call.data.status).toBe(BookingStatus.PROPOSED);
    expect(call.data.retryAfter).toBeNull();
    expect(call.data.proposedFor.getTime()).toBeGreaterThanOrEqual(before + 60 * 60_000);
    expect(call.data.proposedFor.getTime()).toBeLessThanOrEqual(after + 60 * 60_000);
  });

  it('formalise une proposition pour une demande en conflit non encore assignée (depuis /driver/conflicts)', async () => {
    prismaMock.booking.findUnique.mockResolvedValue({ id: 'booking-2', status: BookingStatus.SEARCHING, driverId: null });
    prismaMock.booking.update.mockResolvedValue({ id: 'booking-2', status: BookingStatus.PROPOSED });

    const res = await request(app).post('/bookings/booking-2/refuse').set('Authorization', `Bearer ${driverToken}`).send({ delayMinutes: 30 });

    expect(res.status).toBe(200);
    expect(prismaMock.booking.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'booking-2' },
      data: expect.objectContaining({ driverId: 'driver-1', status: BookingStatus.PROPOSED }),
    }));
  });
});

describe('POST /bookings/:id/proposal/accept', () => {
  it('refuse si la course n’est pas au statut PROPOSED', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', clientId: 'client-1', status: BookingStatus.ASSIGNED, proposedFor: null });
    const res = await request(app).post('/bookings/booking-1/proposal/accept').set('Authorization', `Bearer ${clientToken}`).send({});
    expect(res.status).toBe(409);
    expect(prismaMock.booking.update).not.toHaveBeenCalled();
  });

  it('refuse si le client n’est pas propriétaire de la réservation', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', clientId: 'autre-client', status: BookingStatus.PROPOSED, proposedFor: new Date() });
    const res = await request(app).post('/bookings/booking-1/proposal/accept').set('Authorization', `Bearer ${clientToken}`).send({});
    expect(res.status).toBe(409);
  });

  it('accepte la proposition et fixe le rendez-vous (SCHEDULED)', async () => {
    const proposedFor = new Date('2026-09-22T14:00:00.000Z');
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', clientId: 'client-1', status: BookingStatus.PROPOSED, proposedFor });
    prismaMock.booking.update.mockResolvedValue({ id: 'booking-1', status: BookingStatus.SCHEDULED, scheduledFor: proposedFor });

    const res = await request(app).post('/bookings/booking-1/proposal/accept').set('Authorization', `Bearer ${clientToken}`).send({});

    expect(res.status).toBe(200);
    expect(prismaMock.booking.update).toHaveBeenCalledWith({
      where: { id: 'booking-1' },
      data: { status: BookingStatus.SCHEDULED, scheduledFor: proposedFor, proposedFor: null },
    });
  });
});

describe('POST /bookings/:id/cancel (B02 — règles §2.6)', () => {
  beforeEach(() => {
    prismaMock.booking.findUniqueOrThrow.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve({ id: where.id, status: BookingStatus.CANCELLED }));
  });

  it('refuse d\'annuler une course déjà terminée', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', status: BookingStatus.COMPLETED });
    const res = await request(app).post('/bookings/booking-1/cancel').set('Authorization', `Bearer ${clientToken}`).send({});
    expect(res.status).toBe(409);
  });

  it('refuse qu’un client annule après la prise en charge (PICKED_UP)', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', status: BookingStatus.PICKED_UP });
    const res = await request(app).post('/bookings/booking-1/cancel').set('Authorization', `Bearer ${clientToken}`).send({});
    expect(res.status).toBe(409);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('autorise le dépanneur à annuler même après la prise en charge', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', status: BookingStatus.PICKED_UP, paymentMethod: PaymentMethod.CASH, scheduledFor: null, estimatedPriceCents: 5_000, stripePaymentIntentId: null });
    const res = await request(app).post('/bookings/booking-1/cancel').set('Authorization', `Bearer ${driverToken}`).send({});
    expect(res.status).toBe(200);
  });

  it('gratuite pour une réservation programmée demain, même payée par carte (libère la préautorisation)', async () => {
    const tomorrow = new Date(Date.now() + 25 * 60 * 60 * 1000);
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', status: BookingStatus.SCHEDULED, paymentMethod: PaymentMethod.CARD, scheduledFor: tomorrow, estimatedPriceCents: 10_000, stripePaymentIntentId: 'pi_demo_booking-1' });

    const res = await request(app).post('/bookings/booking-1/cancel').set('Authorization', `Bearer ${clientToken}`).send({ reason: 'Changement de plan' });

    expect(res.status).toBe(200);
    expect(prismaMock.cancellationRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ rule: 'FREE_ADVANCE', feeCents: 0, financialStatus: 'RELEASED' }),
    });
    expect(prismaMock.booking.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: BookingStatus.CANCELLED }),
    }));
  });

  it('facture 50% du devis le jour même payée par carte (capture le montant du solde)', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', status: BookingStatus.SEARCHING, paymentMethod: PaymentMethod.CARD, scheduledFor: null, estimatedPriceCents: 10_000, stripePaymentIntentId: 'pi_demo_booking-1' });

    const res = await request(app).post('/bookings/booking-1/cancel').set('Authorization', `Bearer ${clientToken}`).send({});

    expect(res.status).toBe(200);
    expect(prismaMock.cancellationRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ rule: 'SAME_DAY_CARD_FEE', feeCents: 5_000, financialStatus: 'CAPTURED' }),
    });
    expect(prismaMock.booking.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: BookingStatus.CANCELLED, finalPriceCents: 5_000, paymentStatus: PaymentStatus.PAID }),
    }));
  });

  it('gratuite le jour même payable en espèces', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', status: BookingStatus.SEARCHING, paymentMethod: PaymentMethod.CASH, scheduledFor: null, estimatedPriceCents: 10_000, stripePaymentIntentId: null });

    const res = await request(app).post('/bookings/booking-1/cancel').set('Authorization', `Bearer ${clientToken}`).send({});

    expect(res.status).toBe(200);
    expect(prismaMock.cancellationRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ rule: 'SAME_DAY_CASH_FREE', feeCents: 0, financialStatus: 'NOT_APPLICABLE' }),
    });
  });

  it('ne facture rien si aucune préautorisation n’a jamais été créée (carte non encore payée)', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', status: BookingStatus.PAYMENT_PENDING, paymentMethod: PaymentMethod.CARD, scheduledFor: null, estimatedPriceCents: 10_000, stripePaymentIntentId: null });

    const res = await request(app).post('/bookings/booking-1/cancel').set('Authorization', `Bearer ${clientToken}`).send({});

    expect(res.status).toBe(200);
    expect(prismaMock.cancellationRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ feeCents: 0, financialStatus: 'NOT_APPLICABLE' }),
    });
  });

  it('deux clics d\'annulation ne créent ni double frais ni double remboursement (idempotence)', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', status: BookingStatus.SEARCHING, paymentMethod: PaymentMethod.CARD, scheduledFor: null, estimatedPriceCents: 10_000, stripePaymentIntentId: 'pi_demo_booking-1' });
    prismaMock.cancellationRecord.findUnique.mockResolvedValue({ id: 'cancel-1', bookingId: 'booking-1' });

    const res = await request(app).post('/bookings/booking-1/cancel').set('Authorization', `Bearer ${clientToken}`).send({});

    expect(res.status).toBe(200);
    expect(prismaMock.cancellationRecord.create).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe('POST /bookings/:id/incidents (B03)', () => {
  it('crée un incident persistant et notifie l’autre partie', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', driver: { pushToken: 'push-1' } });
    prismaMock.incident.create.mockResolvedValue({ id: 'incident-1', type: 'Panne moteur pendant le transport', status: 'OPEN' });

    const res = await request(app).post('/bookings/booking-1/incidents').set('Authorization', `Bearer ${clientToken}`)
      .send({ type: 'Panne moteur pendant le transport', description: 'Fumée au démarrage' });

    expect(res.status).toBe(201);
    expect(prismaMock.incident.create).toHaveBeenCalledWith({
      data: { bookingId: 'booking-1', type: 'Panne moteur pendant le transport', description: 'Fumée au démarrage', authorId: 'client-1' },
    });
    expect(res.body).toEqual({ id: 'incident-1', type: 'Panne moteur pendant le transport', status: 'OPEN' });
  });

  it('rejette un incident sans type', async () => {
    const res = await request(app).post('/bookings/booking-1/incidents').set('Authorization', `Bearer ${clientToken}`).send({ description: 'x' });
    expect(res.status).toBe(400);
    expect(prismaMock.incident.create).not.toHaveBeenCalled();
  });

  it('renvoie 404 pour une demande non autorisée', async () => {
    prismaMock.booking.findFirst.mockResolvedValue(null);
    const res = await request(app).post('/bookings/booking-1/incidents').set('Authorization', `Bearer ${clientToken}`).send({ type: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('POST /bookings/:id/photos/upload', () => {
  const writtenFiles: string[] = [];

  afterEach(async () => {
    await Promise.all(writtenFiles.splice(0).map((file) => unlink(file).catch(() => {})));
  });

  it('accepte une vraie image, la recompresse et enregistre son URL', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', clientId: 'client-1' });
    prismaMock.photo.create.mockImplementation(({ data }: { data: { url: string } }) => {
      writtenFiles.push(path.resolve(process.cwd(), 'uploads', data.url.replace('/uploads/', '')));
      return Promise.resolve({ id: 'photo-1', ...data });
    });
    const png = await sharp({ create: { width: 100, height: 100, channels: 3, background: 'red' } }).png().toBuffer();

    const res = await request(app).post('/bookings/booking-1/photos/upload').set('Authorization', `Bearer ${clientToken}`)
      .field('kind', 'PICKUP')
      .attach('photo', png, { filename: 'photo.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(prismaMock.photo.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ bookingId: 'booking-1', kind: 'PICKUP', url: expect.stringMatching(/^\/uploads\/.+\.jpg$/) }),
    }));
  });

  it('rejette un fichier qui n’est pas une image malgré une extension trompeuse', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', clientId: 'client-1' });

    const res = await request(app).post('/bookings/booking-1/photos/upload').set('Authorization', `Bearer ${clientToken}`)
      .field('kind', 'PICKUP')
      .attach('photo', Buffer.from('pas une image'), { filename: 'fake.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(prismaMock.photo.create).not.toHaveBeenCalled();
  });
});

describe('POST /bookings/:id/convert-to-transport (B12)', () => {
  it('convertit une réparation sur place en transport et historise via MissionEvent', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({
      id: 'booking-1', driverId: 'driver-1', status: BookingStatus.DRIVER_ARRIVED, serviceType: ServiceType.ON_SITE_REPAIR,
      issueType: IssueType.BATTERY, scheduledFor: null,
    });
    prismaMock.booking.update.mockResolvedValue({ id: 'booking-1', serviceType: ServiceType.TRANSPORT });

    const res = await request(app).post('/bookings/booking-1/convert-to-transport').set('Authorization', `Bearer ${driverToken}`)
      .send({ destination: parisDestination, distanceKm: 8 });

    expect(res.status).toBe(200);
    expect(prismaMock.booking.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ serviceType: ServiceType.TRANSPORT, distanceKm: 8, destinationAddress: parisDestination.address }),
    }));
    expect(prismaMock.missionEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ bookingId: 'booking-1', type: 'SERVICE_TYPE_CONVERTED', authorId: 'driver-1' }),
    }));
  });

  it('refuse de convertir une mission déjà en transport', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', driverId: 'driver-1', status: BookingStatus.DRIVER_ARRIVED, serviceType: ServiceType.TRANSPORT });
    const res = await request(app).post('/bookings/booking-1/convert-to-transport').set('Authorization', `Bearer ${driverToken}`)
      .send({ destination: parisDestination, distanceKm: 8 });
    expect(res.status).toBe(409);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe('POST /bookings/:id/appointment-change (modification de rendez-vous)', () => {
  it('crée une demande pour une mission programmée', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', clientId: 'client-1', status: BookingStatus.SCHEDULED, scheduledFor: new Date(), driver: { pushToken: null } });
    prismaMock.appointmentChangeRequest.findFirst.mockResolvedValue(null);
    prismaMock.appointmentChangeRequest.create.mockResolvedValue({ id: 'change-1', status: 'PENDING' });

    const proposedFor = new Date(Date.now() + 3600_000).toISOString();
    const res = await request(app).post('/bookings/booking-1/appointment-change').set('Authorization', `Bearer ${clientToken}`).send({ proposedFor });

    expect(res.status).toBe(201);
    expect(prismaMock.appointmentChangeRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ bookingId: 'booking-1', requestedById: 'client-1' }),
    }));
  });

  it('refuse une deuxième demande tant qu’une est en attente', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', clientId: 'client-1', status: BookingStatus.SCHEDULED, scheduledFor: new Date() });
    prismaMock.appointmentChangeRequest.findFirst.mockResolvedValue({ id: 'change-existing', status: 'PENDING' });

    const res = await request(app).post('/bookings/booking-1/appointment-change').set('Authorization', `Bearer ${clientToken}`)
      .send({ proposedFor: new Date(Date.now() + 3600_000).toISOString() });

    expect(res.status).toBe(409);
    expect(prismaMock.appointmentChangeRequest.create).not.toHaveBeenCalled();
  });

  it('le dépanneur accepte la demande et met à jour le rendez-vous', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', driverId: 'driver-1', client: { pushToken: null } });
    const proposedFor = new Date(Date.now() + 3600_000);
    prismaMock.appointmentChangeRequest.findFirst.mockResolvedValue({ id: 'change-1', bookingId: 'booking-1', status: 'PENDING', proposedFor });
    prismaMock.booking.update.mockResolvedValue({ id: 'booking-1', scheduledFor: proposedFor });

    const res = await request(app).post('/bookings/booking-1/appointment-change/change-1/accept').set('Authorization', `Bearer ${driverToken}`).send({});

    expect(res.status).toBe(200);
    expect(prismaMock.appointmentChangeRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'change-1' }, data: expect.objectContaining({ status: 'ACCEPTED', decidedById: 'driver-1' }),
    }));
    expect(prismaMock.booking.update).toHaveBeenCalledWith({ where: { id: 'booking-1' }, data: { scheduledFor: proposedFor } });
  });

  it('le dépanneur refuse la demande sans toucher au rendez-vous existant', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', driverId: 'driver-1', client: { pushToken: null } });
    prismaMock.appointmentChangeRequest.findFirst.mockResolvedValue({ id: 'change-1', bookingId: 'booking-1', status: 'PENDING' });
    prismaMock.appointmentChangeRequest.update.mockResolvedValue({ id: 'change-1', status: 'REJECTED' });

    const res = await request(app).post('/bookings/booking-1/appointment-change/change-1/reject').set('Authorization', `Bearer ${driverToken}`).send({});

    expect(res.status).toBe(200);
    expect(prismaMock.booking.update).not.toHaveBeenCalled();
  });
});

describe('POST /bookings/:id/surcharges (grille §2.5)', () => {
  it('refuse pour un compte client avec 403', async () => {
    const res = await request(app).post('/bookings/booking-1/surcharges').set('Authorization', `Bearer ${clientToken}`).send({ category: 'DESTINATION_CHANGE' });
    expect(res.status).toBe(403);
  });

  it('applique un supplément distance depuis la grille et cumule le total', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', driverId: 'driver-1', status: BookingStatus.IN_TRANSIT, estimatedPriceCents: 10_000, client: { pushToken: null } });
    prismaMock.surcharge.create.mockResolvedValue({ id: 'surcharge-1', category: 'EXTRA_DISTANCE', amountCents: 600 });

    const res = await request(app).post('/bookings/booking-1/surcharges').set('Authorization', `Bearer ${driverToken}`).send({ category: 'EXTRA_DISTANCE', extraKm: 3 });

    expect(res.status).toBe(201);
    expect(prismaMock.surcharge.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ category: 'EXTRA_DISTANCE', amountCents: 600, previousTotalCents: 10_000, newTotalCents: 10_600 }),
    }));
    expect(prismaMock.booking.update).toHaveBeenCalledWith({ where: { id: 'booking-1' }, data: { estimatedPriceCents: 10_600 } });
  });

  it('refuse un supplément sur une mission déjà clôturée', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', driverId: 'driver-1', status: BookingStatus.COMPLETED, estimatedPriceCents: 10_000 });
    const res = await request(app).post('/bookings/booking-1/surcharges').set('Authorization', `Bearer ${driverToken}`).send({ category: 'DESTINATION_CHANGE' });
    expect(res.status).toBe(409);
    expect(prismaMock.surcharge.create).not.toHaveBeenCalled();
  });

  it('rejette une catégorie hors grille', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', driverId: 'driver-1', status: BookingStatus.IN_TRANSIT, estimatedPriceCents: 10_000 });
    const res = await request(app).post('/bookings/booking-1/surcharges').set('Authorization', `Bearer ${driverToken}`).send({ category: 'DISCOUNT' });
    expect(res.status).toBe(400);
  });
});

describe('POST /bookings/:id/contact-attempts et /absence', () => {
  it('enregistre une tentative de contact', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', driverId: 'driver-1' });
    prismaMock.contactAttempt.create.mockResolvedValue({ id: 'attempt-1', method: 'CALL' });

    const res = await request(app).post('/bookings/booking-1/contact-attempts').set('Authorization', `Bearer ${driverToken}`).send({ method: 'CALL' });

    expect(res.status).toBe(201);
    expect(prismaMock.contactAttempt.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ bookingId: 'booking-1', method: 'CALL', authorId: 'driver-1' }),
    }));
  });

  it('déclare une absence, facture 50% du devis et annule la mission (B absence)', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({
      id: 'booking-1', driverId: 'driver-1', status: BookingStatus.DRIVER_ARRIVED, estimatedPriceCents: 8_000, stripePaymentIntentId: 'pi_demo_booking-1', client: { pushToken: null },
    });
    prismaMock.clientAbsence.findUnique.mockResolvedValue(null);
    prismaMock.booking.findUniqueOrThrow.mockResolvedValue({ id: 'booking-1', status: BookingStatus.CANCELLED, finalPriceCents: 4_000 });

    const res = await request(app).post('/bookings/booking-1/absence').set('Authorization', `Bearer ${driverToken}`).send({ reason: 'Absent après deux appels' });

    expect(res.status).toBe(200);
    expect(prismaMock.clientAbsence.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ bookingId: 'booking-1', feeCents: 4_000 }),
    }));
    expect(prismaMock.booking.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: BookingStatus.CANCELLED, finalPriceCents: 4_000, paymentStatus: PaymentStatus.PAID }),
    }));
  });

  it('refuse de déclarer une absence si le dépanneur n’est pas encore sur place', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', driverId: 'driver-1', status: BookingStatus.DRIVER_EN_ROUTE });
    const res = await request(app).post('/bookings/booking-1/absence').set('Authorization', `Bearer ${driverToken}`).send({ reason: 'x' });
    expect(res.status).toBe(409);
    expect(prismaMock.clientAbsence.create).not.toHaveBeenCalled();
  });

  it('un deuxième appel est idempotent (ClientAbsence.bookingId unique)', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', driverId: 'driver-1', status: BookingStatus.DRIVER_ARRIVED, estimatedPriceCents: 8_000 });
    prismaMock.clientAbsence.findUnique.mockResolvedValue({ id: 'absence-1', bookingId: 'booking-1' });
    prismaMock.booking.findUniqueOrThrow.mockResolvedValue({ id: 'booking-1', status: BookingStatus.CANCELLED });

    const res = await request(app).post('/bookings/booking-1/absence').set('Authorization', `Bearer ${driverToken}`).send({ reason: 'x' });

    expect(res.status).toBe(200);
    expect(prismaMock.clientAbsence.create).not.toHaveBeenCalled();
  });
});

describe('POST /bookings/:id/post-pickup-cancellation (§2.6)', () => {
  it('le client soumet une demande après la prise en charge', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', clientId: 'client-1', status: BookingStatus.IN_TRANSIT, driver: { pushToken: null } });
    prismaMock.postPickupCancellationRequest.findFirst.mockResolvedValue(null);
    prismaMock.postPickupCancellationRequest.create.mockResolvedValue({ id: 'req-1', status: 'PENDING' });

    const res = await request(app).post('/bookings/booking-1/post-pickup-cancellation').set('Authorization', `Bearer ${clientToken}`).send({ reason: 'Je préfère un autre garage' });

    expect(res.status).toBe(201);
    expect(prismaMock.postPickupCancellationRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ bookingId: 'booking-1', requestedById: 'client-1' }),
    }));
  });

  it('refuse la demande si la moto n’a pas encore été prise en charge', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', clientId: 'client-1', status: BookingStatus.ASSIGNED });
    const res = await request(app).post('/bookings/booking-1/post-pickup-cancellation').set('Authorization', `Bearer ${clientToken}`).send({});
    expect(res.status).toBe(409);
  });

  it('le dépanneur accepte, fixe une nouvelle destination et applique le supplément de la grille', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', driverId: 'driver-1', estimatedPriceCents: 10_000, client: { pushToken: null } });
    prismaMock.postPickupCancellationRequest.findFirst.mockResolvedValue({ id: 'req-1', bookingId: 'booking-1', status: 'PENDING' });
    prismaMock.booking.findUniqueOrThrow.mockResolvedValue({ id: 'booking-1', destinationAddress: parisDestination.address });

    const res = await request(app).post('/bookings/booking-1/post-pickup-cancellation/req-1/accept').set('Authorization', `Bearer ${driverToken}`).send({ destination: parisDestination });

    expect(res.status).toBe(200);
    expect(prismaMock.surcharge.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ category: 'DESTINATION_CHANGE', amountCents: 1_500, previousTotalCents: 10_000, newTotalCents: 11_500 }),
    }));
    expect(prismaMock.booking.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ destinationAddress: parisDestination.address, estimatedPriceCents: 11_500 }),
    }));
  });

  it('le dépanneur refuse la demande sans changer la destination', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', driverId: 'driver-1', client: { pushToken: null } });
    prismaMock.postPickupCancellationRequest.findFirst.mockResolvedValue({ id: 'req-1', bookingId: 'booking-1', status: 'PENDING' });
    prismaMock.postPickupCancellationRequest.update.mockResolvedValue({ id: 'req-1', status: 'REJECTED' });

    const res = await request(app).post('/bookings/booking-1/post-pickup-cancellation/req-1/reject').set('Authorization', `Bearer ${driverToken}`).send({});

    expect(res.status).toBe(200);
    expect(prismaMock.booking.update).not.toHaveBeenCalled();
  });
});

describe('POST /bookings/:id/payment-fallback (bascule espèces → carte)', () => {
  it('crée une autorisation carte et bascule le moyen de paiement', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', clientId: 'client-1', paymentMethod: PaymentMethod.CASH, status: BookingStatus.DELIVERED, estimatedPriceCents: 7_000, finalPriceCents: null });

    const res = await request(app).post('/bookings/booking-1/payment-fallback').set('Authorization', `Bearer ${clientToken}`).send({});

    expect(res.status).toBe(200);
    expect(res.body.clientSecret).toBeDefined();
    expect(prismaMock.booking.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ paymentMethod: PaymentMethod.CARD, paymentStatus: PaymentStatus.PENDING }),
    }));
  });

  it('refuse la bascule si la mission est déjà réglée par carte', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', clientId: 'client-1', paymentMethod: PaymentMethod.CARD, status: BookingStatus.DELIVERED });
    const res = await request(app).post('/bookings/booking-1/payment-fallback').set('Authorization', `Bearer ${clientToken}`).send({});
    expect(res.status).toBe(409);
  });

  it('confirme le paiement de bascule une fois l’autorisation prête', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', clientId: 'client-1', stripePaymentIntentId: 'pi_demo_booking-1' });
    prismaMock.booking.update.mockResolvedValue({ id: 'booking-1', paymentStatus: PaymentStatus.AUTHORIZED });

    const res = await request(app).post('/bookings/booking-1/payment-fallback/confirmed').set('Authorization', `Bearer ${clientToken}`).send({});

    expect(res.status).toBe(200);
    expect(prismaMock.booking.update).toHaveBeenCalledWith({ where: { id: 'booking-1' }, data: { paymentStatus: PaymentStatus.AUTHORIZED } });
  });
});
