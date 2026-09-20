import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16).default('local-development-secret'),
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
});

export const env = schema.parse(process.env);
