/** Rectangular approximation only; replace with an Île-de-France boundary check in production. */
export function isInServiceArea(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= 48.1 && latitude <= 49.25
    && longitude >= 1.4 && longitude <= 3.6;
}
