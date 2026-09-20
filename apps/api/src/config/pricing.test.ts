import { describe, expect, it } from 'vitest';
import { calculatePrice } from './pricing.js';

describe('calculatePrice', () => {
  it('additionne le forfait et la distance', () => {
    expect(calculatePrice('ENGINE', 10, new Date('2026-09-16T12:00:00'))).toBe(10_000);
  });

  it('applique le supplément de nuit', () => {
    expect(calculatePrice('ENGINE', 10, new Date('2026-09-16T22:00:00'))).toBe(15_000);
  });

  it('applique le supplément du week-end', () => {
    expect(calculatePrice('ENGINE', 10, new Date('2026-09-19T12:00:00'))).toBe(13_000);
  });
});
