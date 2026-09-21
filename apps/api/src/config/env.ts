import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16).default('local-development-secret'),
  JWT_REFRESH_SECRET: z.string().min(16).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('factures@mehdi-depannage.fr'),
  COMPANY_NAME: z.string().default('Mehdi Dépannage'),
  COMPANY_ADDRESS: z.string().default('Île-de-France'),
  COMPANY_SIRET: z.string().default('À compléter'),
  DRIVER_PHONE: z.string().default('+33600000000'),
  CORS_ORIGINS: z.string().optional(),
});

export const env = schema.parse(process.env);

// En production, l'API ne doit pas démarrer silencieusement en mode démo :
// ces variables sont indispensables au fonctionnement réel (paiement, SMS, factures).
if (env.NODE_ENV === 'production') {
  const required: Array<[string, string | undefined]> = [
    ['STRIPE_SECRET_KEY', env.STRIPE_SECRET_KEY],
    ['TWILIO_ACCOUNT_SID', env.TWILIO_ACCOUNT_SID],
    ['TWILIO_AUTH_TOKEN', env.TWILIO_AUTH_TOKEN],
    ['TWILIO_FROM_NUMBER', env.TWILIO_FROM_NUMBER],
    ['SMTP_HOST', env.SMTP_HOST],
    ['SMTP_USER', env.SMTP_USER],
    ['SMTP_PASS', env.SMTP_PASS],
    ['COMPANY_SIRET', env.COMPANY_SIRET === 'À compléter' ? undefined : env.COMPANY_SIRET],
  ];
  const missing = required.filter(([, value]) => !value).map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`Variables d'environnement critiques manquantes en production : ${missing.join(', ')}`);
  }
}

export const corsOrigins = env.CORS_ORIGINS
  ? env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
  : [];
