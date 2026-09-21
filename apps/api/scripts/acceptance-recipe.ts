/**
 * Recette complète (Batch 7 du cahier des charges) : script bout-en-bout qui exerce, contre un
 * vrai serveur API et la base Postgres de développement, toutes les combinaisons carte/espèces,
 * réparation sur place/transport, immédiat/programmé, ainsi que les nouveaux flux du Batch 4/5
 * (conversion vers transport, modification de rendez-vous, supplément, absence, annulation
 * post-prise en charge, bascule de paiement). Ne fait aucune assertion sur le mobile (non testable
 * ici, voir Batch 6) : uniquement le contrat serveur, exactement ce que consomme l'app.
 *
 * Usage : npm run recipe   (depuis apps/api ; démarre son propre serveur sur un port libre,
 * utilise la base Postgres locale déjà migrée — voir README pour la démarrer).
 */
import { spawn, type ChildProcess } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';

const PORT = 4790;
const BASE = `http://localhost:${PORT}`;

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function scenario(name: string, run: () => Promise<void>) {
  try {
    await run();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed++;
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${name} — ${message}`);
    console.log(`  ✗ ${name} — ${message}`);
  }
}

async function api<T>(path: string, token: string | null, options: RequestInit = {}): Promise<{ status: number; body: T }> {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  });
  const body = response.status === 204 ? undefined : await response.json().catch(() => undefined);
  return { status: response.status, body: body as T };
}

const paris = { address: '10 rue de Paris, Paris', latitude: 48.8566, longitude: 2.3522 };
const vincennes = { address: 'Château de Vincennes, Vincennes', latitude: 48.842, longitude: 2.435 };

// L'assignation (assignSingleDriver) est déclenchée en fire-and-forget côté serveur (booking
// créé/payé → réponse HTTP immédiate, assignation en tâche de fond) : on interroge jusqu'à ce
// que le statut change, plutôt qu'une attente fixe fragile face à la latence réelle de la base.
async function waitForAssignment(bookingId: string, token: string): Promise<{ status: string; driverId: string | null }> {
  for (let i = 0; i < 20; i++) {
    const { body } = await api<{ status: string; driverId: string | null }>(`/bookings/${bookingId}`, token);
    if (body.status === 'ASSIGNED' && body.driverId) return body;
    await sleep(250);
  }
  throw new Error(`assignation non observée après 5s pour ${bookingId}`);
}

async function waitForHealth() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch { /* pas encore prêt */ }
    await sleep(500);
  }
  throw new Error('Le serveur ne répond pas sur /health après 20s');
}

async function main() {
  console.log(`Recette complète — démarrage du serveur sur le port ${PORT}...`);
  const server: ChildProcess = spawn('npx', ['tsx', 'src/server.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  server.stdout?.on('data', (chunk) => { serverLog += String(chunk); });
  server.stderr?.on('data', (chunk) => { serverLog += String(chunk); });

  try {
    await waitForHealth();
    console.log('Serveur prêt.\n');

    const { body: clientSession } = await api<{ token: string; user: { id: string } }>('/auth/demo/client', null, { method: 'POST' });
    const { body: driverSession } = await api<{ token: string; user: { id: string } }>('/auth/demo/driver', null, { method: 'POST' });
    const clientToken = clientSession.token;
    const driverToken = driverSession.token;
    await api('/driver/availability', driverToken, { method: 'PATCH', body: JSON.stringify({ available: true }) });

    // Un seul dépanneur existe : chaque scénario doit amener sa réservation à COMPLETED ou
    // CANCELLED avant le scénario suivant, sinon l'assignation automatique du suivant échoue
    // (assignSingleDriver exige zéro mission non terminée sur l'unique dépanneur).

    await scenario('A. Transport + carte + immédiat → mission complète, facture créée', async () => {
      const { status: createStatus, body: booking } = await api<{ id: string; status: string; estimatedPriceCents: number }>('/bookings', clientToken, {
        method: 'POST',
        body: JSON.stringify({ issueType: 'ENGINE', serviceType: 'TRANSPORT', pickup: paris, destination: vincennes, distanceKm: 12, paymentMethod: 'CARD' }),
      });
      assert(createStatus === 201, `création attendue 201, reçu ${createStatus}`);
      assert(booking.status === 'PAYMENT_PENDING', `statut attendu PAYMENT_PENDING, reçu ${booking.status}`);

      const { body: payment } = await api<{ clientSecret: string }>(`/bookings/${booking.id}/payment-intent`, clientToken, { method: 'POST' });
      assert(payment.clientSecret.startsWith('demo_'), 'clientSecret démo attendu (pas de clé Stripe en dev)');
      const { body: confirmed } = await api<{ status: string }>(`/bookings/${booking.id}/payment-confirmed`, clientToken, { method: 'POST' });
      assert(confirmed.status === 'SEARCHING', `statut attendu SEARCHING après paiement, reçu ${confirmed.status}`);

      const assigned = await waitForAssignment(booking.id, clientToken);
      assert(assigned.status === 'ASSIGNED', `statut attendu ASSIGNED, reçu ${assigned.status}`);

      for (const status of ['DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED']) {
        const { status: code } = await api(`/bookings/${booking.id}/status`, driverToken, { method: 'PATCH', body: JSON.stringify({ status }) });
        assert(code === 200, `transition ${status} attendue 200, reçu ${code}`);
      }
      await api(`/bookings/${booking.id}/photos`, driverToken, { method: 'POST', body: JSON.stringify({ kind: 'DELIVERY', url: '/uploads/test-delivery.jpg' }) });

      const { status: completeStatus, body: completed } = await api<{ status: string; paymentStatus: string }>(`/bookings/${booking.id}/status`, driverToken, { method: 'PATCH', body: JSON.stringify({ status: 'COMPLETED' }) });
      assert(completeStatus === 200, `clôture attendue 200, reçu ${completeStatus}`);
      assert(completed.status === 'COMPLETED', `statut attendu COMPLETED, reçu ${completed.status}`);
      assert(completed.paymentStatus === 'PAID', `paymentStatus attendu PAID, reçu ${completed.paymentStatus}`);

      const { body: withInvoice } = await api<{ invoice: { number: string } | null }>(`/bookings/${booking.id}`, clientToken);
      assert(withInvoice.invoice?.number, 'une facture devait être créée à la clôture (B01)');
    });

    await scenario('B. Transport + espèces + immédiat → refuse la clôture sans confirmation, puis complète', async () => {
      const { body: booking } = await api<{ id: string }>('/bookings', clientToken, {
        method: 'POST',
        body: JSON.stringify({ issueType: 'FLAT_TIRE', serviceType: 'TRANSPORT', pickup: paris, destination: vincennes, distanceKm: 8, paymentMethod: 'CASH' }),
      });
      await waitForAssignment(booking.id, clientToken);
      for (const status of ['DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED']) {
        await api(`/bookings/${booking.id}/status`, driverToken, { method: 'PATCH', body: JSON.stringify({ status }) });
      }
      await api(`/bookings/${booking.id}/photos`, driverToken, { method: 'POST', body: JSON.stringify({ kind: 'DELIVERY', url: '/uploads/test-delivery.jpg' }) });

      const { status: refused } = await api(`/bookings/${booking.id}/status`, driverToken, { method: 'PATCH', body: JSON.stringify({ status: 'COMPLETED' }) });
      assert(refused === 409, `clôture sans confirmation espèces attendue 409, reçu ${refused}`);

      const { status: ok, body: completed } = await api<{ status: string }>(`/bookings/${booking.id}/status`, driverToken, { method: 'PATCH', body: JSON.stringify({ status: 'COMPLETED', cashReceived: true }) });
      assert(ok === 200 && completed.status === 'COMPLETED', `clôture espèces confirmée attendue 200/COMPLETED, reçu ${ok}/${completed.status}`);
    });

    await scenario('C. Réparation sur place + carte + immédiat → clôture directe sans étape de transport (B12)', async () => {
      const { body: booking } = await api<{ id: string; status: string; serviceType: string; distanceKm: number | null }>('/bookings', clientToken, {
        method: 'POST',
        body: JSON.stringify({ issueType: 'BATTERY', serviceType: 'ON_SITE_REPAIR', pickup: paris, paymentMethod: 'CARD' }),
      });
      assert(booking.serviceType === 'ON_SITE_REPAIR', 'serviceType attendu ON_SITE_REPAIR');
      assert(booking.distanceKm === null, 'distanceKm attendu nul pour une réparation sur place');

      const { body: payment } = await api<{ clientSecret: string }>(`/bookings/${booking.id}/payment-intent`, clientToken, { method: 'POST' });
      assert(payment.clientSecret.startsWith('demo_'), 'clientSecret démo attendu');
      await api(`/bookings/${booking.id}/payment-confirmed`, clientToken, { method: 'POST' });
      await waitForAssignment(booking.id, clientToken);

      await api(`/bookings/${booking.id}/status`, driverToken, { method: 'PATCH', body: JSON.stringify({ status: 'DRIVER_EN_ROUTE' }) });
      await api(`/bookings/${booking.id}/status`, driverToken, { method: 'PATCH', body: JSON.stringify({ status: 'DRIVER_ARRIVED' }) });

      const { status: blockedTransport } = await api(`/bookings/${booking.id}/status`, driverToken, { method: 'PATCH', body: JSON.stringify({ status: 'PICKED_UP' }) });
      assert(blockedTransport === 409, `étape de transport bloquée attendue 409, reçu ${blockedTransport}`);

      const { status: completeStatus, body: completed } = await api<{ status: string }>(`/bookings/${booking.id}/status`, driverToken, { method: 'PATCH', body: JSON.stringify({ status: 'COMPLETED' }) });
      assert(completeStatus === 200 && completed.status === 'COMPLETED', `clôture directe attendue 200/COMPLETED, reçu ${completeStatus}/${completed.status}`);
    });

    await scenario('D. Réparation sur place + espèces + programmé → reste SCHEDULED sans dépanneur assigné', async () => {
      const scheduledFor = new Date(Date.now() + 26 * 3600_000).toISOString();
      const { body: booking } = await api<{ id: string; status: string; driverId: string | null }>('/bookings', clientToken, {
        method: 'POST',
        body: JSON.stringify({ issueType: 'CHAIN', serviceType: 'ON_SITE_REPAIR', pickup: paris, paymentMethod: 'CASH', scheduledFor }),
      });
      assert(booking.status === 'SCHEDULED', `statut attendu SCHEDULED, reçu ${booking.status}`);
      assert(!booking.driverId, 'aucun dépanneur ne doit être assigné avant le créneau programmé');
      // Nettoyage : annule pour libérer le dépanneur unique pour les scénarios suivants.
      await api(`/bookings/${booking.id}/cancel`, clientToken, { method: 'POST', body: JSON.stringify({ reason: 'Nettoyage recette' }) });
    });

    await scenario('E. Conversion réparation sur place → transport en cours de mission (B12)', async () => {
      const { body: booking } = await api<{ id: string; estimatedPriceCents: number }>('/bookings', clientToken, {
        method: 'POST',
        body: JSON.stringify({ issueType: 'BATTERY', serviceType: 'ON_SITE_REPAIR', pickup: paris, paymentMethod: 'CASH' }),
      });
      await waitForAssignment(booking.id, clientToken);
      await api(`/bookings/${booking.id}/status`, driverToken, { method: 'PATCH', body: JSON.stringify({ status: 'DRIVER_EN_ROUTE' }) });
      await api(`/bookings/${booking.id}/status`, driverToken, { method: 'PATCH', body: JSON.stringify({ status: 'DRIVER_ARRIVED' }) });

      const { status: convertStatus, body: converted } = await api<{ serviceType: string; distanceKm: number; estimatedPriceCents: number }>(`/bookings/${booking.id}/convert-to-transport`, driverToken, {
        method: 'POST',
        body: JSON.stringify({ destination: vincennes, distanceKm: 9 }),
      });
      assert(convertStatus === 200, `conversion attendue 200, reçu ${convertStatus}`);
      assert(converted.serviceType === 'TRANSPORT', 'serviceType attendu TRANSPORT après conversion');
      assert(converted.estimatedPriceCents > booking.estimatedPriceCents, 'le prix doit augmenter après ajout du transport');

      for (const status of ['PICKED_UP', 'IN_TRANSIT', 'DELIVERED']) {
        await api(`/bookings/${booking.id}/status`, driverToken, { method: 'PATCH', body: JSON.stringify({ status }) });
      }
      await api(`/bookings/${booking.id}/photos`, driverToken, { method: 'POST', body: JSON.stringify({ kind: 'DELIVERY', url: '/uploads/test-delivery.jpg' }) });
      const { status: completeStatus } = await api(`/bookings/${booking.id}/status`, driverToken, { method: 'PATCH', body: JSON.stringify({ status: 'COMPLETED', cashReceived: true }) });
      assert(completeStatus === 200, `clôture après conversion attendue 200, reçu ${completeStatus}`);
    });

    await scenario('F. Modification de rendez-vous : le client propose, le dépanneur accepte', async () => {
      const scheduledFor = new Date(Date.now() + 26 * 3600_000).toISOString();
      const { body: booking } = await api<{ id: string }>('/bookings', clientToken, {
        method: 'POST',
        body: JSON.stringify({ issueType: 'ENGINE', serviceType: 'TRANSPORT', pickup: paris, destination: vincennes, distanceKm: 10, paymentMethod: 'CASH', scheduledFor }),
      });
      const proposedFor = new Date(Date.now() + 50 * 3600_000).toISOString();
      const { status: createStatus, body: change } = await api<{ id: string; status: string }>(`/bookings/${booking.id}/appointment-change`, clientToken, {
        method: 'POST', body: JSON.stringify({ proposedFor }),
      });
      assert(createStatus === 201 && change.status === 'PENDING', `demande attendue 201/PENDING, reçu ${createStatus}/${change.status}`);

      // Le dépanneur n'a pas encore de driverId sur cette mission SCHEDULED : vérifie qu'il peut
      // tout de même décider (correction de bug appliquée dans ce batch).
      const { status: acceptStatus, body: updated } = await api<{ scheduledFor: string }>(`/bookings/${booking.id}/appointment-change/${change.id}/accept`, driverToken, { method: 'POST' });
      assert(acceptStatus === 200, `acceptation attendue 200, reçu ${acceptStatus}`);
      assert(updated.scheduledFor === proposedFor, 'le nouveau créneau doit être appliqué à la réservation');

      await api(`/bookings/${booking.id}/cancel`, clientToken, { method: 'POST', body: JSON.stringify({ reason: 'Nettoyage recette' }) });
    });

    await scenario('G. Supplément appliqué depuis la grille pendant le transport', async () => {
      const { body: booking } = await api<{ id: string; estimatedPriceCents: number }>('/bookings', clientToken, {
        method: 'POST',
        body: JSON.stringify({ issueType: 'ENGINE', serviceType: 'TRANSPORT', pickup: paris, destination: vincennes, distanceKm: 10, paymentMethod: 'CASH' }),
      });
      await waitForAssignment(booking.id, clientToken);
      for (const status of ['DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'PICKED_UP', 'IN_TRANSIT']) {
        await api(`/bookings/${booking.id}/status`, driverToken, { method: 'PATCH', body: JSON.stringify({ status }) });
      }
      const { status: surchargeStatus, body: surcharge } = await api<{ amountCents: number; previousTotalCents: number; newTotalCents: number }>(`/bookings/${booking.id}/surcharges`, driverToken, {
        method: 'POST', body: JSON.stringify({ category: 'EXTRA_DISTANCE', extraKm: 4 }),
      });
      assert(surchargeStatus === 201, `application du supplément attendue 201, reçu ${surchargeStatus}`);
      assert(surcharge.newTotalCents === surcharge.previousTotalCents + surcharge.amountCents, 'le nouveau total doit refléter le supplément');

      const { body: afterSurcharge } = await api<{ estimatedPriceCents: number }>(`/bookings/${booking.id}`, clientToken);
      assert(afterSurcharge.estimatedPriceCents === surcharge.newTotalCents, 'le prix de la réservation doit être mis à jour');

      await api(`/bookings/${booking.id}/status`, driverToken, { method: 'PATCH', body: JSON.stringify({ status: 'DELIVERED' }) });
      await api(`/bookings/${booking.id}/photos`, driverToken, { method: 'POST', body: JSON.stringify({ kind: 'DELIVERY', url: '/uploads/test-delivery.jpg' }) });
      await api(`/bookings/${booking.id}/status`, driverToken, { method: 'PATCH', body: JSON.stringify({ status: 'COMPLETED', cashReceived: true }) });
    });

    await scenario('H. Annulation post-prise en charge : demande client, acceptation dépanneur avec nouvelle destination', async () => {
      const { body: booking } = await api<{ id: string; estimatedPriceCents: number }>('/bookings', clientToken, {
        method: 'POST',
        body: JSON.stringify({ issueType: 'ENGINE', serviceType: 'TRANSPORT', pickup: paris, destination: vincennes, distanceKm: 10, paymentMethod: 'CASH' }),
      });
      await waitForAssignment(booking.id, clientToken);
      for (const status of ['DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'PICKED_UP']) {
        await api(`/bookings/${booking.id}/status`, driverToken, { method: 'PATCH', body: JSON.stringify({ status }) });
      }
      const { status: clientCancelStatus } = await api(`/bookings/${booking.id}/cancel`, clientToken, { method: 'POST', body: JSON.stringify({}) });
      assert(clientCancelStatus === 409, `annulation directe par le client après prise en charge attendue 409, reçu ${clientCancelStatus}`);

      const { status: requestStatus, body: request } = await api<{ id: string; status: string }>(`/bookings/${booking.id}/post-pickup-cancellation`, clientToken, {
        method: 'POST', body: JSON.stringify({ reason: 'Je préfère un autre garage' }),
      });
      assert(requestStatus === 201 && request.status === 'PENDING', `demande attendue 201/PENDING, reçu ${requestStatus}/${request.status}`);

      const newDestination = { address: 'Bois de Vincennes, Paris', latitude: 48.828, longitude: 2.433 };
      const { status: acceptStatus, body: accepted } = await api<{ destinationAddress: string; estimatedPriceCents: number }>(`/bookings/${booking.id}/post-pickup-cancellation/${request.id}/accept`, driverToken, {
        method: 'POST', body: JSON.stringify({ destination: newDestination }),
      });
      assert(acceptStatus === 200, `acceptation attendue 200, reçu ${acceptStatus}`);
      assert(accepted.destinationAddress === newDestination.address, 'la nouvelle destination doit être appliquée');
      assert(accepted.estimatedPriceCents > booking.estimatedPriceCents, 'un supplément changement de destination doit être ajouté');

      for (const status of ['IN_TRANSIT', 'DELIVERED']) {
        await api(`/bookings/${booking.id}/status`, driverToken, { method: 'PATCH', body: JSON.stringify({ status }) });
      }
      await api(`/bookings/${booking.id}/photos`, driverToken, { method: 'POST', body: JSON.stringify({ kind: 'DELIVERY', url: '/uploads/test-delivery.jpg' }) });
      await api(`/bookings/${booking.id}/status`, driverToken, { method: 'PATCH', body: JSON.stringify({ status: 'COMPLETED', cashReceived: true }) });
    });

    await scenario('I. Déclaration d’absence : frais de 50% et annulation automatique', async () => {
      const { body: booking } = await api<{ id: string; estimatedPriceCents: number }>('/bookings', clientToken, {
        method: 'POST',
        body: JSON.stringify({ issueType: 'ENGINE', serviceType: 'TRANSPORT', pickup: paris, destination: vincennes, distanceKm: 10, paymentMethod: 'CASH' }),
      });
      await waitForAssignment(booking.id, clientToken);
      await api(`/bookings/${booking.id}/status`, driverToken, { method: 'PATCH', body: JSON.stringify({ status: 'DRIVER_EN_ROUTE' }) });
      await api(`/bookings/${booking.id}/status`, driverToken, { method: 'PATCH', body: JSON.stringify({ status: 'DRIVER_ARRIVED' }) });

      await api(`/bookings/${booking.id}/contact-attempts`, driverToken, { method: 'POST', body: JSON.stringify({ method: 'CALL' }) });
      const { status: absenceStatus, body: cancelled } = await api<{ status: string; finalPriceCents: number }>(`/bookings/${booking.id}/absence`, driverToken, {
        method: 'POST', body: JSON.stringify({ reason: 'Client injoignable après plusieurs tentatives' }),
      });
      assert(absenceStatus === 200, `déclaration d’absence attendue 200, reçu ${absenceStatus}`);
      assert(cancelled.status === 'CANCELLED', `statut attendu CANCELLED, reçu ${cancelled.status}`);
      assert(cancelled.finalPriceCents === Math.round(booking.estimatedPriceCents * 0.5), `frais attendus 50% du devis (${Math.round(booking.estimatedPriceCents * 0.5)}), reçu ${cancelled.finalPriceCents}`);
    });

    await scenario('J. Bascule espèces → carte quand les espèces sont insuffisantes', async () => {
      const { body: booking } = await api<{ id: string; paymentMethod: string }>('/bookings', clientToken, {
        method: 'POST',
        body: JSON.stringify({ issueType: 'ENGINE', serviceType: 'TRANSPORT', pickup: paris, destination: vincennes, distanceKm: 10, paymentMethod: 'CASH' }),
      });
      await waitForAssignment(booking.id, clientToken);
      for (const status of ['DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED']) {
        await api(`/bookings/${booking.id}/status`, driverToken, { method: 'PATCH', body: JSON.stringify({ status }) });
      }
      const { status: fallbackStatus, body: fallback } = await api<{ clientSecret: string }>(`/bookings/${booking.id}/payment-fallback`, clientToken, { method: 'POST' });
      assert(fallbackStatus === 200 && fallback.clientSecret, `bascule attendue 200 avec clientSecret, reçu ${fallbackStatus}`);
      await api(`/bookings/${booking.id}/payment-fallback/confirmed`, clientToken, { method: 'POST' });

      const { body: switched } = await api<{ paymentMethod: string }>(`/bookings/${booking.id}`, clientToken);
      assert(switched.paymentMethod === 'CARD', `moyen de paiement attendu CARD après bascule, reçu ${switched.paymentMethod}`);

      await api(`/bookings/${booking.id}/photos`, driverToken, { method: 'POST', body: JSON.stringify({ kind: 'DELIVERY', url: '/uploads/test-delivery.jpg' }) });
      const { status: completeStatus, body: completed } = await api<{ status: string; paymentStatus: string }>(`/bookings/${booking.id}/status`, driverToken, { method: 'PATCH', body: JSON.stringify({ status: 'COMPLETED' }) });
      assert(completeStatus === 200 && completed.paymentStatus === 'PAID', `clôture après bascule carte attendue 200/PAID, reçu ${completeStatus}/${completed.paymentStatus}`);
    });

    await scenario('K. Annulation gratuite à l’avance (carte, programmé), aucun frais', async () => {
      const scheduledFor = new Date(Date.now() + 30 * 3600_000).toISOString();
      const { body: booking } = await api<{ id: string }>('/bookings', clientToken, {
        method: 'POST',
        body: JSON.stringify({ issueType: 'ENGINE', serviceType: 'TRANSPORT', pickup: paris, destination: vincennes, distanceKm: 10, paymentMethod: 'CARD', scheduledFor }),
      });
      await api(`/bookings/${booking.id}/payment-intent`, clientToken, { method: 'POST' });
      await api(`/bookings/${booking.id}/payment-confirmed`, clientToken, { method: 'POST' });

      const { status: cancelStatus, body: cancelled } = await api<{ status: string; finalPriceCents: number | null }>(`/bookings/${booking.id}/cancel`, clientToken, {
        method: 'POST', body: JSON.stringify({ reason: 'Changement de plan' }),
      });
      assert(cancelStatus === 200 && cancelled.status === 'CANCELLED', `annulation attendue 200/CANCELLED, reçu ${cancelStatus}/${cancelled.status}`);
      assert(!cancelled.finalPriceCents, `aucun frais attendu pour une annulation gratuite à l’avance, reçu ${cancelled.finalPriceCents}`);
    });

    await scenario('L. Garages partenaires accessibles à un utilisateur authentifié', async () => {
      const { status, body: garages } = await api<Array<{ id: string; name: string }>>('/garages', clientToken);
      assert(status === 200, `liste des garages attendue 200, reçu ${status}`);
      assert(Array.isArray(garages), 'une liste de garages est attendue');
    });

    console.log(`\n${passed} scénario(s) réussi(s), ${failed} échoué(s).`);
    if (failures.length) {
      console.log('\nÉchecs :');
      for (const f of failures) console.log(`  - ${f}`);
    }
  } finally {
    server.kill();
    if (failed > 0 && process.env.RECIPE_VERBOSE) console.log('\n--- journal du serveur ---\n' + serverLog);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(1); });
