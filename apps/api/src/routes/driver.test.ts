import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  unavailability: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
  booking: { findMany: vi.fn() },
}));

vi.mock('../config/prisma.js', () => ({ prisma: prismaMock }));

const { driverRouter } = await import('./driver.js');
const { errorHandler } = await import('../middleware/errors.js');
const { signToken } = await import('../middleware/auth.js');
const { CONFLICT_MESSAGE } = await import('../services/assignment.js');
const { BookingStatus } = await import('@prisma/client');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/driver', driverRouter);
  app.use(errorHandler);
  return app;
}

const app = buildApp();
const driverToken = signToken({ userId: 'driver-1', role: 'DRIVER' });
const clientToken = signToken({ userId: 'client-1', role: 'CLIENT' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /driver/unavailability', () => {
  it('refuse un compte client avec 403', async () => {
    const res = await request(app).get('/driver/unavailability').set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(403);
  });

  it('liste les indisponibilités du dépanneur authentifié', async () => {
    prismaMock.unavailability.findMany.mockResolvedValue([{ id: 'u1' }]);
    const res = await request(app).get('/driver/unavailability').set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'u1' }]);
    expect(prismaMock.unavailability.findMany).toHaveBeenCalledWith({ where: { driverId: 'driver-1' }, orderBy: { createdAt: 'desc' } });
  });
});

describe('POST /driver/unavailability', () => {
  it('crée un créneau ponctuel valide', async () => {
    prismaMock.unavailability.create.mockResolvedValue({ id: 'u1' });
    const res = await request(app).post('/driver/unavailability').set('Authorization', `Bearer ${driverToken}`)
      .send({ type: 'ONE_TIME', startAt: '2026-10-01T14:00:00.000Z', endAt: '2026-10-01T16:00:00.000Z' });

    expect(res.status).toBe(201);
    expect(prismaMock.unavailability.create).toHaveBeenCalledWith({
      data: {
        driverId: 'driver-1', type: 'ONE_TIME',
        startAt: new Date('2026-10-01T14:00:00.000Z'), endAt: new Date('2026-10-01T16:00:00.000Z'),
        weekday: null, startTime: null, endTime: null,
      },
    });
  });

  it('rejette un créneau ponctuel où la fin précède le début', async () => {
    const res = await request(app).post('/driver/unavailability').set('Authorization', `Bearer ${driverToken}`)
      .send({ type: 'ONE_TIME', startAt: '2026-10-01T16:00:00.000Z', endAt: '2026-10-01T14:00:00.000Z' });
    expect(res.status).toBe(400);
    expect(prismaMock.unavailability.create).not.toHaveBeenCalled();
  });

  it('crée un créneau récurrent valide', async () => {
    prismaMock.unavailability.create.mockResolvedValue({ id: 'u2' });
    const res = await request(app).post('/driver/unavailability').set('Authorization', `Bearer ${driverToken}`)
      .send({ type: 'RECURRING', weekday: 2, startTime: '08:00', endTime: '12:00' });

    expect(res.status).toBe(201);
    expect(prismaMock.unavailability.create).toHaveBeenCalledWith({
      data: { driverId: 'driver-1', type: 'RECURRING', startAt: null, endAt: null, weekday: 2, startTime: '08:00', endTime: '12:00' },
    });
  });

  it('rejette un créneau récurrent où la fin précède le début', async () => {
    const res = await request(app).post('/driver/unavailability').set('Authorization', `Bearer ${driverToken}`)
      .send({ type: 'RECURRING', weekday: 2, startTime: '12:00', endTime: '08:00' });
    expect(res.status).toBe(400);
    expect(prismaMock.unavailability.create).not.toHaveBeenCalled();
  });

  it('rejette un format d’heure invalide', async () => {
    const res = await request(app).post('/driver/unavailability').set('Authorization', `Bearer ${driverToken}`)
      .send({ type: 'RECURRING', weekday: 2, startTime: '8h00', endTime: '12:00' });
    expect(res.status).toBe(400);
  });
});

describe('GET /driver/conflicts', () => {
  it('refuse un compte client avec 403', async () => {
    const res = await request(app).get('/driver/conflicts').set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(403);
  });

  it('liste les demandes non assignées ayant reçu le message automatique de conflit', async () => {
    prismaMock.booking.findMany.mockResolvedValue([{ id: 'booking-1', status: BookingStatus.SEARCHING }]);
    const res = await request(app).get('/driver/conflicts').set('Authorization', `Bearer ${driverToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'booking-1', status: BookingStatus.SEARCHING }]);
    expect(prismaMock.booking.findMany).toHaveBeenCalledWith({
      where: {
        status: { in: [BookingStatus.SEARCHING, BookingStatus.SCHEDULED] },
        messages: { some: { senderId: 'driver-1', body: CONFLICT_MESSAGE } },
      },
      include: { client: true, vehicle: true },
      orderBy: { updatedAt: 'desc' },
    });
  });
});

describe('GET /driver/appointment-changes', () => {
  it('refuse un compte client avec 403', async () => {
    const res = await request(app).get('/driver/appointment-changes').set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(403);
  });

  it('liste les missions avec une demande de modification en attente, sans filtrer par driverId', async () => {
    prismaMock.booking.findMany.mockResolvedValue([{ id: 'booking-1', status: BookingStatus.SCHEDULED, driverId: null }]);
    const res = await request(app).get('/driver/appointment-changes').set('Authorization', `Bearer ${driverToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'booking-1', status: BookingStatus.SCHEDULED, driverId: null }]);
    expect(prismaMock.booking.findMany).toHaveBeenCalledWith({
      where: { appointmentChangeRequests: { some: { status: 'PENDING' } } },
      include: { client: true, vehicle: true, appointmentChangeRequests: { where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' } } },
      orderBy: { updatedAt: 'desc' },
    });
  });
});

describe('DELETE /driver/unavailability/:id', () => {
  it('supprime une indisponibilité appartenant au dépanneur', async () => {
    prismaMock.unavailability.findFirst.mockResolvedValue({ id: 'u1', driverId: 'driver-1' });
    prismaMock.unavailability.delete.mockResolvedValue({});
    const res = await request(app).delete('/driver/unavailability/u1').set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(204);
    expect(prismaMock.unavailability.findFirst).toHaveBeenCalledWith({ where: { id: 'u1', driverId: 'driver-1' } });
    expect(prismaMock.unavailability.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
  });

  it('renvoie 404 si l’indisponibilité n’appartient pas à ce dépanneur', async () => {
    prismaMock.unavailability.findFirst.mockResolvedValue(null);
    const res = await request(app).delete('/driver/unavailability/u1').set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(404);
    expect(prismaMock.unavailability.delete).not.toHaveBeenCalled();
  });
});
