import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  otpCode: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  user: { upsert: vi.fn(), update: vi.fn(), delete: vi.fn(), findUniqueOrThrow: vi.fn() },
}));

vi.mock('../config/prisma.js', () => ({ prisma: prismaMock }));

const { authRouter } = await import('./auth.js');
const { errorHandler } = await import('../middleware/errors.js');
const { signToken } = await import('../middleware/auth.js');
const { env } = await import('../config/env.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  app.use(errorHandler);
  return app;
}

const app = buildApp();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /auth/request-otp', () => {
  it('crée un code OTP pour un numéro valide et répond 204', async () => {
    prismaMock.otpCode.create.mockResolvedValue({ id: 'otp-1' });

    const res = await request(app).post('/auth/request-otp').send({ phone: '+33612345678' });

    expect(res.status).toBe(204);
    expect(prismaMock.otpCode.create).toHaveBeenCalledTimes(1);
    const data = prismaMock.otpCode.create.mock.calls[0][0].data;
    expect(data.phone).toBe('+33612345678');
    expect(typeof data.codeHash).toBe('string');
  });

  it('rejette un numéro de téléphone invalide avec 400', async () => {
    const res = await request(app).post('/auth/request-otp').send({ phone: 'pas-un-numero' });

    expect(res.status).toBe(400);
    expect(prismaMock.otpCode.create).not.toHaveBeenCalled();
  });
});

describe('POST /auth/verify-otp', () => {
  it('refuse un code incorrect ou expiré avec 401', async () => {
    prismaMock.otpCode.findFirst.mockResolvedValue(null);

    const res = await request(app).post('/auth/verify-otp').send({ phone: '+33612345678', code: '123456' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Code incorrect ou expiré');
    expect(prismaMock.user.upsert).not.toHaveBeenCalled();
  });

  it('crée/retourne un client avec un token pour un code valide', async () => {
    const bcrypt = (await import('bcryptjs')).default;
    const codeHash = await bcrypt.hash('123456', 10);
    prismaMock.otpCode.findFirst.mockResolvedValue({ id: 'otp-1', codeHash });
    prismaMock.otpCode.update.mockResolvedValue({});
    prismaMock.user.upsert.mockResolvedValue({ id: 'user-1', phone: '+33612345678', role: 'CLIENT' });

    const res = await request(app).post('/auth/verify-otp').send({ phone: '+33612345678', code: '123456', firstName: 'Walid' });

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: 'user-1', phone: '+33612345678', role: 'CLIENT' });
    expect(typeof res.body.token).toBe('string');
    expect(prismaMock.otpCode.update).toHaveBeenCalledWith({ where: { id: 'otp-1' }, data: { consumedAt: expect.any(Date) } });
  });

  it('attribue le rôle DRIVER quand le numéro correspond à DRIVER_PHONE', async () => {
    const bcrypt = (await import('bcryptjs')).default;
    const codeHash = await bcrypt.hash('123456', 10);
    prismaMock.otpCode.findFirst.mockResolvedValue({ id: 'otp-2', codeHash });
    prismaMock.otpCode.update.mockResolvedValue({});
    prismaMock.user.upsert.mockResolvedValue({ id: 'driver-1', phone: env.DRIVER_PHONE, role: 'DRIVER' });

    await request(app).post('/auth/verify-otp').send({ phone: env.DRIVER_PHONE, code: '123456' });

    expect(prismaMock.user.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ role: 'DRIVER' }) }));
  });
});

describe('GET /auth/me', () => {
  it('refuse une requête sans jeton avec 401', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('retourne le profil pour un jeton valide', async () => {
    const token = signToken({ userId: 'user-1', role: 'CLIENT' });
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({ id: 'user-1', vehicles: [] });

    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'user-1', vehicles: [] });
  });

  it('refuse un jeton invalide avec 401', async () => {
    const res = await request(app).get('/auth/me').set('Authorization', 'Bearer invalide');
    expect(res.status).toBe(401);
  });
});
