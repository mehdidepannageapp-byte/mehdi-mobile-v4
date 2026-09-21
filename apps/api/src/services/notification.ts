import twilio from 'twilio';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { prisma } from '../config/prisma.js';

export async function sendSms(to: string, body: string) {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER) {
    if (env.NODE_ENV !== 'production') logger.info({ to, body }, 'SMS démo (Twilio non configuré)');
    return;
  }
  const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  await client.messages.create({ to, from: env.TWILIO_FROM_NUMBER, body });
}

/**
 * Notification push pour un événement important de mission (§2.7). Respecte la préférence
 * facultative du destinataire (B06) — jamais utilisée pour les communications transactionnelles
 * obligatoires (SMS/e-mail de confirmation et de facture, gérés séparément). Un fournisseur push
 * indisponible ou en erreur ne doit jamais faire échouer la transaction métier appelante.
 */
export async function sendPush(recipient: { id: string; pushToken?: string | null } | null | undefined, title: string, body: string, data: object = {}) {
  if (!recipient?.pushToken) return;
  try {
    const preference = await prisma.notificationPreference.findUnique({ where: { userId: recipient.id } });
    if (preference && !preference.pushEnabled) return;
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: recipient.pushToken, sound: 'default', title, body, data }),
    });
  } catch (error) {
    logger.warn({ err: error, userId: recipient.id }, 'Notification push non délivrée');
  }
}
