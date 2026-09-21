import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, setApiToken, setRefreshToken, setSessionHandlers } from './api';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
  setApiToken(null);
  setRefreshToken(null);
  setSessionHandlers({});
});

describe('requêtes de base', () => {
  it('envoie le numéro de téléphone et ne retourne rien pour une réponse 204', async () => {
    fetchMock.mockResolvedValue(jsonResponse(undefined, 204));

    await expect(api.requestOtp('+33612345678')).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/request-otp'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ phone: '+33612345678' }) }),
    );
  });

  it('ajoute l’en-tête Authorization une fois le jeton défini', async () => {
    setApiToken('mon-jeton');
    fetchMock.mockResolvedValue(jsonResponse({ id: 'u1' }));

    await api.me();

    const [, options] = fetchMock.mock.calls[0];
    expect((options.headers as Record<string, string>).Authorization).toBe('Bearer mon-jeton');
  });

  it('rejette avec le message d’erreur renvoyé par le serveur', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Code incorrect ou expiré' }, 401));

    await expect(api.verifyOtp('+33612345678', '000000')).rejects.toThrow('Code incorrect ou expiré');
  });
});

describe('rafraîchissement automatique du jeton', () => {
  it('rafraîchit le jeton sur un 401 puis rejoue la requête initiale, sans erreur visible', async () => {
    setApiToken('access-expired');
    setRefreshToken('refresh-valid');
    const onSessionRefreshed = vi.fn();
    setSessionHandlers({ onSessionRefreshed });

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'Session expirée' }, 401))
      .mockResolvedValueOnce(jsonResponse({ token: 'access-new', refreshToken: 'refresh-new', user: { id: 'u1' } }))
      .mockResolvedValueOnce(jsonResponse({ id: 'u1', vehicles: [] }));

    const result = await api.me();

    expect(result).toEqual({ id: 'u1', vehicles: [] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1][0])).toContain('/auth/refresh');
    expect(onSessionRefreshed).toHaveBeenCalledWith({ token: 'access-new', refreshToken: 'refresh-new', user: { id: 'u1' } });
    const retryHeaders = fetchMock.mock.calls[2][1].headers as Record<string, string>;
    expect(retryHeaders.Authorization).toBe('Bearer access-new');
  });

  it('efface la session et propage l’erreur si le refresh token est aussi invalide', async () => {
    setApiToken('access-expired');
    setRefreshToken('refresh-invalid');
    const onSessionExpired = vi.fn();
    setSessionHandlers({ onSessionExpired });

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'Session expirée' }, 401))
      .mockResolvedValueOnce(jsonResponse({ error: 'Session expirée, reconnectez-vous' }, 401));

    await expect(api.me()).rejects.toThrow();

    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('ne tente pas de rafraîchir sans refresh token disponible', async () => {
    setApiToken('access-expired');
    setRefreshToken(null);
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Session expirée' }, 401));

    await expect(api.me()).rejects.toThrow('Session expirée');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// Batch 4/5 : chaque nouveau flux mobile doit appeler le bon endpoint avec la bonne méthode et le
// bon corps de requête. Ces tests couvrent la couche données (api.ts) des nouveaux écrans ; le
// rendu des écrans eux-mêmes n'est pas testable ici (voir test-mocks/react-native.ts, qui ne
// fournit que Platform — pas de rendu de composants React Native dans cette suite Vitest/jsdom).
describe('nouveaux flux (garages, réparation sur place, rendez-vous, suppléments, absence, annulation, paiement)', () => {
  it('liste les garages partenaires', async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ id: 'g1', name: 'Garage A' }]));
    await api.garages();
    expect(String(fetchMock.mock.calls[0][0])).toContain('/garages');
  });

  it('convertit une réparation sur place en transport', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'b1' }));
    const destination = { address: '1 rue X', latitude: 48.8, longitude: 2.3 };
    await api.convertToTransport('b1', destination, 8);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/bookings/b1/convert-to-transport'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ destination, distanceKm: 8 }) }),
    );
  });

  it('envoie une demande de modification de rendez-vous', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'change-1' }));
    await api.requestAppointmentChange('b1', '2026-10-01T10:00:00.000Z');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/bookings/b1/appointment-change'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ proposedFor: '2026-10-01T10:00:00.000Z' }) }),
    );
  });

  it('accepte et refuse une demande de modification de rendez-vous', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'b1' }));
    await api.acceptAppointmentChange('b1', 'change-1');
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/bookings/b1/appointment-change/change-1/accept'), expect.objectContaining({ method: 'POST' }));
    await api.rejectAppointmentChange('b1', 'change-1');
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/bookings/b1/appointment-change/change-1/reject'), expect.objectContaining({ method: 'POST' }));
  });

  it('liste les missions avec une demande de modification en attente côté dépanneur', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));
    await api.driverAppointmentChanges();
    expect(String(fetchMock.mock.calls[0][0])).toContain('/driver/appointment-changes');
  });

  it('applique un supplément avec la catégorie et la distance', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 's1' }));
    await api.applySurcharge('b1', 'EXTRA_DISTANCE', 3);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/bookings/b1/surcharges'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ category: 'EXTRA_DISTANCE', extraKm: 3 }) }),
    );
  });

  it('enregistre une tentative de contact', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'attempt-1' }));
    await api.contactAttempt('b1', 'CALL');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/bookings/b1/contact-attempts'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ method: 'CALL', note: undefined }) }),
    );
  });

  it('déclare une absence avec le motif', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'b1' }));
    await api.declareAbsence('b1', 'Client injoignable');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/bookings/b1/absence'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ reason: 'Client injoignable' }) }),
    );
  });

  it('soumet, accepte et refuse une demande d’annulation post-prise en charge', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'req-1' }));
    await api.requestPostPickupCancellation('b1', 'Changement de plan');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/bookings/b1/post-pickup-cancellation'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ reason: 'Changement de plan' }) }),
    );
    const destination = { address: '1 rue X', latitude: 48.8, longitude: 2.3 };
    await api.acceptPostPickupCancellation('b1', 'req-1', destination);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/bookings/b1/post-pickup-cancellation/req-1/accept'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ destination }) }),
    );
    await api.rejectPostPickupCancellation('b1', 'req-1');
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/bookings/b1/post-pickup-cancellation/req-1/reject'), expect.objectContaining({ method: 'POST' }));
  });

  it('crée puis confirme un paiement de bascule espèces vers carte', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ clientSecret: 'demo_secret_b1' }));
    await api.paymentFallback('b1');
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/bookings/b1/payment-fallback'), expect.objectContaining({ method: 'POST' }));
    await api.confirmPaymentFallback('b1');
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/bookings/b1/payment-fallback/confirmed'), expect.objectContaining({ method: 'POST' }));
  });
});
