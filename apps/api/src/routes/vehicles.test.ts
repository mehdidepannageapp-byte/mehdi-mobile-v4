import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  vehicle: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn(), deleteMany: vi.fn() },
}));

vi.mock('../config/prisma.js', () => ({ prisma: prismaMock }));

const { vehiclesRouter } = await import('./vehicles.js');
const { errorHandler } = await import('../middleware/errors.js');
const { signToken } = await import('../middleware/auth.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/vehicles', vehiclesRouter);
  app.use(errorHandler);
  return app;
}

const app = buildApp();
const clientToken = signToken({ userId: 'client-1', role: 'CLIENT' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /vehicles', () => {
  it('liste les motos du client authentifié', async () => {
    prismaMock.vehicle.findMany.mockResolvedValue([{ id: 'v1', brand: 'Yamaha', model: 'MT-07' }]);
    const res = await request(app).get('/vehicles').set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'v1', brand: 'Yamaha', model: 'MT-07' }]);
  });
});

describe('POST /vehicles', () => {
  it('crée une moto', async () => {
    prismaMock.vehicle.create.mockResolvedValue({ id: 'v1', brand: 'Yamaha', model: 'MT-07' });
    const res = await request(app).post('/vehicles').set('Authorization', `Bearer ${clientToken}`).send({ brand: 'Yamaha', model: 'MT-07' });
    expect(res.status).toBe(201);
    expect(prismaMock.vehicle.create).toHaveBeenCalledWith({ data: { brand: 'Yamaha', model: 'MT-07', ownerId: 'client-1' } });
  });

  it('rejette une moto sans marque', async () => {
    const res = await request(app).post('/vehicles').set('Authorization', `Bearer ${clientToken}`).send({ model: 'MT-07' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /vehicles/:id (B04)', () => {
  it('modifie une moto appartenant au client', async () => {
    prismaMock.vehicle.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.vehicle.findUniqueOrThrow.mockResolvedValue({ id: 'v1', brand: 'Yamaha', model: 'MT-09', plate: 'AB-123-CD' });

    const res = await request(app).patch('/vehicles/v1').set('Authorization', `Bearer ${clientToken}`).send({ model: 'MT-09' });

    expect(res.status).toBe(200);
    expect(prismaMock.vehicle.updateMany).toHaveBeenCalledWith({ where: { id: 'v1', ownerId: 'client-1' }, data: { model: 'MT-09' } });
    expect(res.body.model).toBe('MT-09');
  });

  it('renvoie 404 si la moto n’appartient pas au client', async () => {
    prismaMock.vehicle.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(app).patch('/vehicles/v1').set('Authorization', `Bearer ${clientToken}`).send({ model: 'MT-09' });
    expect(res.status).toBe(404);
    expect(prismaMock.vehicle.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});

describe('DELETE /vehicles/:id', () => {
  it('supprime une moto', async () => {
    prismaMock.vehicle.deleteMany.mockResolvedValue({ count: 1 });
    const res = await request(app).delete('/vehicles/v1').set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(204);
    expect(prismaMock.vehicle.deleteMany).toHaveBeenCalledWith({ where: { id: 'v1', ownerId: 'client-1' } });
  });
});
