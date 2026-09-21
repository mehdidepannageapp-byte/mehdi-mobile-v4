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
