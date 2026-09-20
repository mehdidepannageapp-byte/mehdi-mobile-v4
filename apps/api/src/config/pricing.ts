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
