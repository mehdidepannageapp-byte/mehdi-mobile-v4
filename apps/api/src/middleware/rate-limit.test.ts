import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createOtpLimiter } from './rate-limit.js';

function buildApp() {
  const app = express();
  const limiter = createOtpLimiter({ windowMs: 60_000, limit: 2, message: 'Trop de tentatives' });
  app.post('/otp', limiter, (_req, res) => res.status(204).end());
  return app;
}

describe('createOtpLimiter', () => {
  it('laisse passer les requêtes sous la limite puis bloque au-delà avec 429', async () => {
    const app = buildApp();

    const first = await request(app).post('/otp');
    const second = await request(app).post('/otp');
    const third = await request(app).post('/otp');

    expect(first.status).toBe(204);
    expect(second.status).toBe(204);
    expect(third.status).toBe(429);
    expect(third.body.error).toBe('Trop de tentatives');
  });
});
