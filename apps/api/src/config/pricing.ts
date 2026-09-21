import type { IssueType } from '@prisma/client';

export const pricing = {
  currency: 'eur',
  baseByIssueCents: {
    ENGINE: 8_000,
    FLAT_TIRE: 6_000,
    BATTERY: 5_500,
    ACCIDENT: 10_000,
    CHAIN: 6_500,
    OTHER: 7_000,
  } satisfies Record<IssueType, number>,
  perKmCents: 200,
  nightSurchargeRate: 0.5,
  weekendSurchargeRate: 0.3,
  serviceArea: 'Île-de-France',
  retryMinutes: 2,
};

/**
 * Grille des suppléments applicables APRÈS acceptation du devis (§2.5 du cahier des charges),
 * distincte du calcul initial ci-dessus (qui reste inchangé). Toute évolution de ces montants
 * doit incrémenter GRID_VERSION pour que les suppléments déjà appliqués restent traçables à la
 * version de grille qui les a produits (voir Surcharge.gridVersion).
 */
export const surchargeGrid = {
  version: '2026-09-1',
  destinationChangeFeeCents: 1_500,
  extraDistancePerKmCents: pricing.perKmCents,
  nightSurchargeRate: pricing.nightSurchargeRate,
  sundaySurchargeRate: pricing.weekendSurchargeRate,
  holidaySurchargeRate: pricing.weekendSurchargeRate,
};

/** Frais d'absence client : 50 % du devis accepté (§2.6), non modifiable par requête. */
export const absenceFeeRate = 0.5;
/** Frais d'annulation le jour même payée par carte : 50 % du devis accepté (§2.6). */
export const sameDayCardCancellationFeeRate = 0.5;

export function calculatePrice(issueType: IssueType, distanceKm: number, date: Date) {
  const base = pricing.baseByIssueCents[issueType];
  const distance = Math.max(0, distanceKm) * pricing.perKmCents;
  const hour = date.getHours();
  const isNight = hour >= 20 || hour < 7;
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
  const subtotal = base + distance;
  const night = isNight ? subtotal * pricing.nightSurchargeRate : 0;
  const weekend = isWeekend ? subtotal * pricing.weekendSurchargeRate : 0;
  return Math.round(subtotal + night + weekend);
}
