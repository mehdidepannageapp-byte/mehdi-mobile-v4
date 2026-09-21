import { describe, expect, it } from 'vitest';
import { surchargeGrid } from '../config/pricing.js';
import { calculateSurchargeAmountCents } from './surcharges.js';

describe('calculateSurchargeAmountCents', () => {
  it('applique le forfait fixe de changement de destination', () => {
    expect(calculateSurchargeAmountCents({ category: 'DESTINATION_CHANGE' })).toBe(surchargeGrid.destinationChangeFeeCents);
  });

  it('calcule la distance supplémentaire au tarif au kilomètre de la grille', () => {
    expect(calculateSurchargeAmountCents({ category: 'EXTRA_DISTANCE', extraKm: 10 })).toBe(10 * surchargeGrid.extraDistancePerKmCents);
  });

  it('ignore une distance supplémentaire négative', () => {
    expect(calculateSurchargeAmountCents({ category: 'EXTRA_DISTANCE', extraKm: -5 })).toBe(0);
  });

  it('applique le taux de nuit sur le montant de base', () => {
    expect(calculateSurchargeAmountCents({ category: 'NIGHT', baseAmountCents: 10_000 })).toBe(Math.round(10_000 * surchargeGrid.nightSurchargeRate));
  });

  it('applique le taux du dimanche sur le montant de base', () => {
    expect(calculateSurchargeAmountCents({ category: 'SUNDAY', baseAmountCents: 10_000 })).toBe(Math.round(10_000 * surchargeGrid.sundaySurchargeRate));
  });

  it('applique le taux de jour férié sur le montant de base', () => {
    expect(calculateSurchargeAmountCents({ category: 'HOLIDAY', baseAmountCents: 10_000 })).toBe(Math.round(10_000 * surchargeGrid.holidaySurchargeRate));
  });
});
