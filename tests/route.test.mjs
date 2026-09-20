import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateRouteDistanceKm, isInServiceArea } from '../apps/mobile/src/utils/route.ts';
import { isInServiceArea as serverAccepts } from '../apps/api/src/config/service-area.ts';

const paris = { address: 'Paris', latitude: 48.8675, longitude: 2.3635 };
const vincennes = { address: 'Vincennes', latitude: 48.842, longitude: 2.435 };
const cupertino = { address: 'Apple Park', latitude: 37.3349, longitude: -122.009 };

test('Paris -> Vincennes produit un devis possible et une distance finie', () => {
  const result = estimateRouteDistanceKm(paris, vincennes);
  assert.ok(result !== null && result > 2 && result < 20);
});

test('le GPS du simulateur hors Île-de-France est refusé côté mobile et API', () => {
  assert.equal(isInServiceArea(cupertino), false);
  assert.equal(serverAccepts(cupertino.latitude, cupertino.longitude), false);
  assert.equal(estimateRouteDistanceKm(cupertino, paris), null);
});

test('deux lieux identiques produisent le minimum provisoire de 2 km', () => {
  assert.equal(estimateRouteDistanceKm(paris, paris), 2);
});

test('une adresse absente ou des coordonnées invalides ne produisent pas de tarif', () => {
  assert.equal(estimateRouteDistanceKm(undefined, paris), null);
  assert.equal(estimateRouteDistanceKm({ ...paris, latitude: NaN }, vincennes), null);
  assert.equal(estimateRouteDistanceKm({ ...paris, latitude: Infinity }, vincennes), null);
});

test('les contrôles de zone mobile et API restent cohérents', () => {
  for (const point of [paris, vincennes, cupertino, { ...paris, latitude: 51 }, { ...paris, longitude: 0 }]) {
    assert.equal(isInServiceArea(point), serverAccepts(point.latitude, point.longitude));
  }
});
