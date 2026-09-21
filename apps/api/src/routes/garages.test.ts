import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  garage: { findMany: vi.fn() },
}));

vi.mock('../config/prisma.js', () => ({ prisma: prismaMock }));

const { garagesRouter } = await import('./garages.js');
const { errorHandler } = await import('../middleware/errors.js');
const { signToken } = await import('../middleware/auth.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/garages', garagesRouter);
  app.use(errorHandler);
  return app;
}

const app = buildApp();
const clientToken = signToken({ userId: 'client-1', role: 'CLIENT' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /garages', () => {
  it('refuse un accès non authentifié', async () => {
    const res = await request(app).get('/garages');
    expect(res.status).toBe(401);
  });

  it('renvoie les garages actifs triés', async () => {
    prismaMock.garage.findMany.mockResolvedValue([{ id: 'garage-1', name: 'Garage A', active: true, order: 0 }]);

    const res = await request(app).get('/garages').set('Authorization', `Bearer ${clientToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'garage-1', name: 'Garage A', active: true, order: 0 }]);
    expect(prismaMock.garage.findMany).toHaveBeenCalledWith({ where: { active: true }, orderBy: { order: 'asc' } });
  });
});
