import Stripe from 'stripe';
import { env } from '../config/env.js';

const stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;

export async function createAuthorization(amount: number, bookingId: string) {
  if (!stripe) {
    return { id: `pi_demo_${bookingId}`, clientSecret: `demo_secret_${bookingId}` };
  }
  const intent = await stripe.paymentIntents.create({
    amount,
    currency: 'eur',
    capture_method: 'manual',
    automatic_payment_methods: { enabled: true },
    metadata: { bookingId },
  });
  return { id: intent.id, clientSecret: intent.client_secret };
}

export async function isAuthorizationReady(paymentIntentId: string) {
  if (!stripe || paymentIntentId.startsWith('pi_demo_')) return true;
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  return intent.status === 'requires_capture' || intent.status === 'succeeded';
}

export async function captureAuthorization(paymentIntentId: string, finalAmount?: number) {
  if (!stripe || paymentIntentId.startsWith('pi_demo_')) return;
  await stripe.paymentIntents.capture(paymentIntentId, finalAmount ? { amount_to_capture: finalAmount } : undefined);
}

export async function cancelAuthorization(paymentIntentId: string) {
  if (!stripe || paymentIntentId.startsWith('pi_demo_')) return;
  await stripe.paymentIntents.cancel(paymentIntentId);
}
