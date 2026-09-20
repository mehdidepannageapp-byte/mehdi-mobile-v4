import type { Place } from '../types';

// Encadrement géographique approximatif pour éviter les positions de simulateur
// situées hors de la zone desservie. Une validation fine reste nécessaire en production.
export function isInServiceArea(place: Place): boolean {
  return Number.isFinite(place.latitude) && Number.isFinite(place.longitude)
    && place.latitude >= 48.1 && place.latitude <= 49.25
    && place.longitude >= 1.4 && place.longitude <= 3.6;
}

export function estimateRouteDistanceKm(pickup?: Place, destination?: Place): number | null {
  if (!pickup || !destination || !isInServiceArea(pickup) || !isInServiceArea(destination)) return null;
  const radians = Math.PI / 180;
  const deltaLatitude = (destination.latitude - pickup.latitude) * radians;
  const deltaLongitude = (destination.longitude - pickup.longitude) * radians;
  const haversine = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(pickup.latitude * radians) * Math.cos(destination.latitude * radians)
      * Math.sin(deltaLongitude / 2) ** 2;
  const straightLineKm = 12742 * Math.asin(Math.sqrt(Math.min(1, haversine)));
  // Provisoire : approximation, et non un trajet réel calculé par une API d'itinéraire.
  const estimatedKm = Math.max(2, straightLineKm * 1.25);
  return Number.isFinite(estimatedKm) && estimatedKm <= 300 ? estimatedKm : null;
}
