import { describe, expect, it } from 'vitest';
import { calculateAbsenceFeeCents, decideCancellation } from './cancellation.js';

describe('decideCancellation', () => {
  it('est gratuite pour une réservation programmée demain, même payée par carte', () => {
    const now = new Date('2026-09-21T10:00:00Z'); // lundi
    const scheduledFor = new Date('2026-09-22T10:00:00Z'); // mardi
    const decision = decideCancellation({ scheduledFor, paymentMethod: 'CARD', acceptedAmountCents: 10_000, now });
    expect(decision).toEqual({ rule: 'FREE_ADVANCE', feeCents: 0, basisAmountCents: 10_000 });
  });

  it('facture 50% du devis accepté pour une intervention le jour même payée par carte', () => {
    const now = new Date('2026-09-21T10:00:00Z');
    const scheduledFor = new Date('2026-09-21T14:00:00Z');
    const decision = decideCancellation({ scheduledFor, paymentMethod: 'CARD', acceptedAmountCents: 10_000, now });
    expect(decision).toEqual({ rule: 'SAME_DAY_CARD_FEE', feeCents: 5_000, basisAmountCents: 10_000 });
  });

  it('est gratuite pour une intervention le jour même payable en espèces', () => {
    const now = new Date('2026-09-21T10:00:00Z');
    const scheduledFor = new Date('2026-09-21T14:00:00Z');
    const decision = decideCancellation({ scheduledFor, paymentMethod: 'CASH', acceptedAmountCents: 10_000, now });
    expect(decision).toEqual({ rule: 'SAME_DAY_CASH_FREE', feeCents: 0, basisAmountCents: 10_000 });
  });

  it('traite une demande immédiate (scheduledFor null) comme le jour même', () => {
    const now = new Date('2026-09-21T10:00:00Z');
    const decision = decideCancellation({ scheduledFor: null, paymentMethod: 'CARD', acceptedAmountCents: 8_000, now });
    expect(decision.rule).toBe('SAME_DAY_CARD_FEE');
    expect(decision.feeCents).toBe(4_000);
  });

  it('cas limite Paris : réservation à 23h50 pour 00h10 le lendemain est gratuite (changement de date civile, pas 24h glissantes)', () => {
    // 23h50 heure de Paris (CEST, UTC+2 en septembre) le 21/09 = 21h50 UTC.
    const now = new Date('2026-09-21T21:50:00Z');
    // 00h10 heure de Paris le 22/09 = 22h10 UTC le 21/09, soit seulement 20 minutes plus tard.
    const scheduledFor = new Date('2026-09-21T22:10:00Z');
    const decision = decideCancellation({ scheduledFor, paymentMethod: 'CARD', acceptedAmountCents: 10_000, now });
    expect(decision.rule).toBe('FREE_ADVANCE');
    expect(decision.feeCents).toBe(0);
  });
});

describe('calculateAbsenceFeeCents', () => {
  it('facture exactement 50% du devis accepté', () => {
    expect(calculateAbsenceFeeCents(10_000)).toBe(5_000);
    expect(calculateAbsenceFeeCents(7_999)).toBe(4_000); // arrondi au plus proche
  });
});
