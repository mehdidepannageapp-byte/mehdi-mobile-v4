import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  booking: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
  user: { findFirst: vi.fn() },
  invoice: { upsert: vi.fn() },
  photo: { create: vi.fn() },
}));

vi.mock('../config/prisma.js', () => ({ prisma: prismaMock }));

const { bookingsRouter } = await import('./bookings.js');
const { errorHandler } = await import('../middleware/errors.js');
const { signToken } = await import('../middleware/auth.js');
const { BookingStatus, IssueType, PaymentMethod, PaymentStatus } = await import('@prisma/client');
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
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', status: BookingStatus.DRIVER_ARRIVED, paymentMethod: PaymentMethod.CASH, estimatedPriceCents: 1000 });
    const res = await request(app).patch('/bookings/booking-1/status').set('Authorization', `Bearer ${driverToken}`)
      .send({ status: BookingStatus.DRIVER_EN_ROUTE });
    expect(res.status).toBe(409);
  });

  it('autorise une transition valide et notifie le client', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', status: BookingStatus.ASSIGNED, paymentMethod: PaymentMethod.CASH, estimatedPriceCents: 1000, client: { pushToken: null } });
    prismaMock.booking.update.mockResolvedValue({ id: 'booking-1', status: BookingStatus.DRIVER_EN_ROUTE });

    const res = await request(app).patch('/bookings/booking-1/status').set('Authorization', `Bearer ${driverToken}`)
      .send({ status: BookingStatus.DRIVER_EN_ROUTE });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(BookingStatus.DRIVER_EN_ROUTE);
  });

  it('exige la confirmation du paiement en espèces pour finaliser une course CASH', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', status: BookingStatus.DELIVERED, paymentMethod: PaymentMethod.CASH, estimatedPriceCents: 1000 });

    const res = await request(app).patch('/bookings/booking-1/status').set('Authorization', `Bearer ${driverToken}`)
      .send({ status: BookingStatus.COMPLETED });

    expect(res.status).toBe(409);
    expect(prismaMock.booking.update).not.toHaveBeenCalled();
  });

  it('finalise une course CASH une fois le paiement confirmé', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', status: BookingStatus.DELIVERED, paymentMethod: PaymentMethod.CASH, estimatedPriceCents: 1000, finalPriceCents: null, reference: 'MD-2026-ABCDEF' });
    prismaMock.booking.update.mockResolvedValue({ id: 'booking-1', status: BookingStatus.COMPLETED, paymentStatus: PaymentStatus.PAID });

    const res = await request(app).patch('/bookings/booking-1/status').set('Authorization', `Bearer ${driverToken}`)
      .send({ status: BookingStatus.COMPLETED, cashReceived: true });

    expect(res.status).toBe(200);
    expect(prismaMock.booking.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: BookingStatus.COMPLETED, paymentStatus: PaymentStatus.PAID }),
    }));
    expect(prismaMock.invoice.upsert).not.toHaveBeenCalled();
  });

  it('finalise une course carte payée par autorisation démo et crée la facture', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({
      id: 'booking-2', status: BookingStatus.DELIVERED, paymentMethod: PaymentMethod.CARD,
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

describe('POST /bookings/:id/cancel', () => {
  it('refuse d\'annuler une course déjà terminée', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', status: BookingStatus.COMPLETED });
    const res = await request(app).post('/bookings/booking-1/cancel').set('Authorization', `Bearer ${clientToken}`).send({});
    expect(res.status).toBe(409);
  });

  it('annule une course active', async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: 'booking-1', status: BookingStatus.SEARCHING, stripePaymentIntentId: null });
    prismaMock.booking.update.mockResolvedValue({ id: 'booking-1', status: BookingStatus.CANCELLED });

    const res = await request(app).post('/bookings/booking-1/cancel').set('Authorization', `Bearer ${clientToken}`).send({ reason: 'Changement de plan' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(BookingStatus.CANCELLED);
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
