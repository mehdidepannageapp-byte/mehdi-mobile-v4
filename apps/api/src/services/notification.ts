import twilio from 'twilio';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export async function sendSms(to: string, body: string) {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER) {
    if (env.NODE_ENV !== 'production') logger.info({ to, body }, 'SMS démo (Twilio non configuré)');
    return;
  }
  const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  await client.messages.create({ to, from: env.TWILIO_FROM_NUMBER, body });
}

export async function sendPush(expoPushToken: string | null | undefined, title: string, body: string, data: object = {}) {
  if (!expoPushToken) return;
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: expoPushToken, sound: 'default', title, body, data }),
  });
}
