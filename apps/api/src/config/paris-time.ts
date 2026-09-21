/**
 * Résout la date/heure civile à Paris pour un instant donné, indépendamment du fuseau horaire
 * du serveur. Utilisé par toutes les règles commerciales sensibles à la date (annulation,
 * absence, suppléments nuit/dimanche/jour férié — §2.5/§2.6 du cahier des charges).
 */
export type ParisCivilDateTime = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Paris',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
  weekday: 'short',
});
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function toParisCivilDateTime(date: Date): ParisCivilDateTime {
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const hour = get('hour');
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: hour === '24' ? 0 : Number(hour),
    minute: Number(get('minute')),
    weekday: WEEKDAY_INDEX[get('weekday')] ?? date.getUTCDay(),
  };
}

/** Compare uniquement la date civile (ignore l'heure) : -1 si a < b, 0 si égal, 1 si a > b. */
export function compareCivilDate(a: ParisCivilDateTime, b: ParisCivilDateTime): -1 | 0 | 1 {
  if (a.year !== b.year) return a.year < b.year ? -1 : 1;
  if (a.month !== b.month) return a.month < b.month ? -1 : 1;
  if (a.day !== b.day) return a.day < b.day ? -1 : 1;
  return 0;
}
