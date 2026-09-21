import type { PaymentMethod } from '@prisma/client';
import { absenceFeeRate, sameDayCardCancellationFeeRate } from '../config/pricing.js';
import { compareCivilDate, toParisCivilDateTime } from '../config/paris-time.js';

export type CancellationRuleName = 'FREE_ADVANCE' | 'SAME_DAY_CARD_FEE' | 'SAME_DAY_CASH_FREE';

export type CancellationDecision = {
  rule: CancellationRuleName;
  feeCents: number;
  basisAmountCents: number;
};

/**
 * Détermine la règle et les frais d'annulation (§2.6 du cahier des charges) :
 * - Réservation prévue demain ou plus tard : gratuite, même payée par carte.
 * - Réservation prévue le jour même, payée par carte : frais = 50 % du devis accepté.
 * - Réservation prévue le jour même, payable en espèces : gratuite.
 *
 * Le calcul du « jour même » compare les dates civiles Europe/Paris (voir config/paris-time.ts),
 * jamais une durée glissante de 24h — une réservation à 23h50 pour 00h10 le lendemain doit être
 * gratuite (changement de date civile), pas facturée comme si l'écart n'était que de 20 minutes.
 */
export function decideCancellation(params: {
  /** Heure prévue de l'intervention ; null pour une demande immédiate (= maintenant). */
  scheduledFor: Date | null;
  paymentMethod: PaymentMethod;
  acceptedAmountCents: number;
  now?: Date;
}): CancellationDecision {
  const now = params.now ?? new Date();
  const interventionAt = params.scheduledFor ?? now;
  const isSameCivilDay = compareCivilDate(toParisCivilDateTime(now), toParisCivilDateTime(interventionAt)) === 0;

  if (!isSameCivilDay) {
    return { rule: 'FREE_ADVANCE', feeCents: 0, basisAmountCents: params.acceptedAmountCents };
  }
  if (params.paymentMethod === 'CASH') {
    return { rule: 'SAME_DAY_CASH_FREE', feeCents: 0, basisAmountCents: params.acceptedAmountCents };
  }
  return {
    rule: 'SAME_DAY_CARD_FEE',
    feeCents: Math.round(params.acceptedAmountCents * sameDayCardCancellationFeeRate),
    basisAmountCents: params.acceptedAmountCents,
  };
}

/** Frais d'absence client : 50 % du devis accepté (§2.6), quel que soit le moyen de paiement. */
export function calculateAbsenceFeeCents(acceptedAmountCents: number): number {
  return Math.round(acceptedAmountCents * absenceFeeRate);
}
