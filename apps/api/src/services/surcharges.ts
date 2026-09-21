import { surchargeGrid } from '../config/pricing.js';

/**
 * Calcule le montant d'un supplément à partir de la grille tarifaire (config/pricing.ts) — jamais
 * une valeur libre. Le type d'entrée (discriminé par `category`) garantit à la compilation que
 * seules les catégories de la grille (§2.5) peuvent être soumises à l'API.
 */
export type SurchargeCalculationInput =
  | { category: 'DESTINATION_CHANGE' }
  | { category: 'EXTRA_DISTANCE'; extraKm: number }
  | { category: 'NIGHT' | 'SUNDAY' | 'HOLIDAY'; baseAmountCents: number };

export function calculateSurchargeAmountCents(input: SurchargeCalculationInput): number {
  switch (input.category) {
    case 'DESTINATION_CHANGE':
      return surchargeGrid.destinationChangeFeeCents;
    case 'EXTRA_DISTANCE':
      return Math.round(Math.max(0, input.extraKm) * surchargeGrid.extraDistancePerKmCents);
    case 'NIGHT':
      return Math.round(input.baseAmountCents * surchargeGrid.nightSurchargeRate);
    case 'SUNDAY':
      return Math.round(input.baseAmountCents * surchargeGrid.sundaySurchargeRate);
    case 'HOLIDAY':
      return Math.round(input.baseAmountCents * surchargeGrid.holidaySurchargeRate);
  }
}
