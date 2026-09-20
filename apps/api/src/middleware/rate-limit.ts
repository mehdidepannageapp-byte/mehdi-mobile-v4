import rateLimit, { type Options } from 'express-rate-limit';

type LimiterConfig = Partial<Options> & { windowMs: number; limit: number; message: string };

export function createOtpLimiter({ message, ...options }: LimiterConfig) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    ...options,
    message: { error: message },
  });
}

const skipInTest = () => process.env.NODE_ENV === 'test';

export const requestOtpLimiter = createOtpLimiter({
  windowMs: 15 * 60_000,
  limit: 10,
  skip: skipInTest,
  message: 'Trop de demandes de code, réessayez plus tard',
});

export const verifyOtpLimiter = createOtpLimiter({
  windowMs: 15 * 60_000,
  limit: 20,
  skip: skipInTest,
  message: 'Trop de tentatives, réessayez plus tard',
});
