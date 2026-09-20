import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { isInServiceArea } from '../config/service-area.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

export const placesRouter = Router();
placesRouter.use(requireAuth);

// Ces lieux sont des exemples fixes. Sans clé Google Maps, aucune adresse
// saisie par l'utilisateur n'est authentifiée et il ne faut pas le prétendre.
const demoPlaces = {
  'demo-paris': { address: 'Place de la République, Paris (démo)', latitude: 48.8675, longitude: 2.3635 },
  'demo-vincennes': { address: 'Château de Vincennes, Vincennes (démo)', latitude: 48.8420, longitude: 2.4350 },
  'demo-idf': { address: 'Gare de Versailles-Chantiers, Versailles (démo)', latitude: 48.7950, longitude: 2.1360 },
};

placesRouter.get('/autocomplete', asyncHandler(async (req, res) => {
  const { query } = z.object({ query: z.string().min(3) }).parse(req.query);
  if (!env.GOOGLE_MAPS_API_KEY) {
    // Le texte tapé n'est pas géocodé : seuls les trois lieux fixes sont proposés.
    return res.json(Object.entries(demoPlaces).map(([id, place]) => ({ id, description: place.address })));
  }
  const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
  url.searchParams.set('input', query);
  url.searchParams.set('components', 'country:fr');
  url.searchParams.set('location', '48.8566,2.3522');
  url.searchParams.set('radius', '70000');
  url.searchParams.set('key', env.GOOGLE_MAPS_API_KEY);
  url.searchParams.set('language', 'fr');
  const response = await fetch(url);
  const json = await response.json() as { predictions?: Array<{ place_id: string; description: string }> };
  res.json((json.predictions ?? []).map((p) => ({ id: p.place_id, description: p.description })));
}));

placesRouter.get('/details/:placeId', asyncHandler(async (req, res) => {
  const placeId = String(req.params.placeId);
  if (!env.GOOGLE_MAPS_API_KEY || placeId.startsWith('demo-')) {
    const place = demoPlaces[placeId as keyof typeof demoPlaces];
    if (!place) return res.status(404).json({ error: 'Adresse de démonstration introuvable' });
    return res.json({ ...place, inServiceArea: true });
  }
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', placeId);
  url.searchParams.set('fields', 'formatted_address,geometry');
  url.searchParams.set('key', env.GOOGLE_MAPS_API_KEY);
  url.searchParams.set('language', 'fr');
  const response = await fetch(url);
  const json = await response.json() as { result?: { formatted_address: string; geometry: { location: { lat: number; lng: number } } } };
  if (!json.result) return res.status(404).json({ error: 'Adresse introuvable' });
  const { lat, lng } = json.result.geometry.location;
  const inServiceArea = isInServiceArea(lat, lng);
  res.json({ address: json.result.formatted_address, latitude: lat, longitude: lng, inServiceArea });
}));
