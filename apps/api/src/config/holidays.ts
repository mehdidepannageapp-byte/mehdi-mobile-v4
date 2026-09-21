/**
 * Calendrier des jours fériés français, utilisé pour les suppléments et les règles
 * d'annulation (voir config/paris-time.ts pour la résolution de la date civile Europe/Paris).
 * Source configurable et testable : jours fixes ci-dessous + jours mobiles calculés à partir
 * de Pâques (algorithme de Meeus/Jones/Butcher, calendrier grégorien).
 */

/** Jours fériés fixes (mois 1-indexé, jour). Modifiable pour un autre périmètre géographique. */
const FIXED_HOLIDAYS: ReadonlyArray<readonly [month: number, day: number]> = [
  [1, 1],   // Jour de l'An
  [5, 1],   // Fête du Travail
  [5, 8],   // Victoire 1945
  [7, 14],  // Fête nationale
  [8, 15],  // Assomption
  [11, 1],  // Toussaint
  [11, 11], // Armistice
  [12, 25], // Noël
];

function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function addDaysToCivilDate(year: number, month: number, day: number, days: number): { year: number; month: number; day: number } {
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function holidayKeysForYear(year: number): Set<string> {
  const easter = easterSunday(year);
  const movable = [
    addDaysToCivilDate(year, easter.month, easter.day, 1),  // Lundi de Pâques
    addDaysToCivilDate(year, easter.month, easter.day, 39), // Ascension
    addDaysToCivilDate(year, easter.month, easter.day, 50), // Lundi de Pentecôte
  ];
  const fixed = FIXED_HOLIDAYS.map(([month, day]) => ({ year, month, day }));
  return new Set([...fixed, ...movable].map((d) => `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`));
}

/** Indique si la date civile donnée (déjà résolue, ex. via toParisCivilDateTime) est un jour férié français. */
export function isPublicHoliday(civilDate: { year: number; month: number; day: number }): boolean {
  const key = `${civilDate.year}-${String(civilDate.month).padStart(2, '0')}-${String(civilDate.day).padStart(2, '0')}`;
  return holidayKeysForYear(civilDate.year).has(key);
}
