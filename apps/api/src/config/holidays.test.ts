import { describe, expect, it } from 'vitest';
import { isPublicHoliday } from './holidays.js';

describe('isPublicHoliday', () => {
  it('reconnaît les jours fériés fixes', () => {
    expect(isPublicHoliday({ year: 2026, month: 1, day: 1 })).toBe(true);
    expect(isPublicHoliday({ year: 2026, month: 5, day: 1 })).toBe(true);
    expect(isPublicHoliday({ year: 2026, month: 5, day: 8 })).toBe(true);
    expect(isPublicHoliday({ year: 2026, month: 7, day: 14 })).toBe(true);
    expect(isPublicHoliday({ year: 2026, month: 8, day: 15 })).toBe(true);
    expect(isPublicHoliday({ year: 2026, month: 11, day: 1 })).toBe(true);
    expect(isPublicHoliday({ year: 2026, month: 11, day: 11 })).toBe(true);
    expect(isPublicHoliday({ year: 2026, month: 12, day: 25 })).toBe(true);
  });

  it('calcule correctement les jours fériés mobiles (Pâques 2026 = 5 avril)', () => {
    expect(isPublicHoliday({ year: 2026, month: 4, day: 6 })).toBe(true); // Lundi de Pâques
    expect(isPublicHoliday({ year: 2026, month: 5, day: 14 })).toBe(true); // Ascension
    expect(isPublicHoliday({ year: 2026, month: 5, day: 25 })).toBe(true); // Lundi de Pentecôte
  });

  it('calcule correctement une autre année (Pâques 2025 = 20 avril)', () => {
    expect(isPublicHoliday({ year: 2025, month: 4, day: 21 })).toBe(true); // Lundi de Pâques
    expect(isPublicHoliday({ year: 2025, month: 5, day: 29 })).toBe(true); // Ascension
    expect(isPublicHoliday({ year: 2025, month: 6, day: 9 })).toBe(true); // Lundi de Pentecôte
  });

  it('ne signale pas un jour ordinaire comme férié', () => {
    expect(isPublicHoliday({ year: 2026, month: 6, day: 15 })).toBe(false);
    expect(isPublicHoliday({ year: 2026, month: 3, day: 2 })).toBe(false);
  });
});
