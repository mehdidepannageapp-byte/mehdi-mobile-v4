import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setApiToken, setRefreshToken } from '../services/api';
import { AuthProvider, useAuth } from './AuthContext';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

const session = { token: 'access-1', refreshToken: 'refresh-1', user: { id: 'u1', phone: '+33612345678', role: 'CLIENT' as const } };

beforeEach(async () => {
  fetchMock.mockReset();
  await AsyncStorage.clear();
  setApiToken(null);
  setRefreshToken(null);
});

describe('AuthProvider', () => {
  it('démarre déconnecté quand aucune session n’est stockée', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
  });

  it('restaure une session précédemment persistée au démarrage', async () => {
    await AsyncStorage.setItem('mehdi.auth', JSON.stringify(session));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.user).toEqual(session.user);
    expect(result.current.token).toBe('access-1');
  });

  it('persiste la session (état + stockage) après verifyOtp', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(session));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.verifyOtp('+33612345678', '000000'); });

    expect(result.current.user).toEqual(session.user);
    expect(result.current.token).toBe('access-1');
    const stored = JSON.parse((await AsyncStorage.getItem('mehdi.auth'))!);
    expect(stored).toEqual(session);
  });

  it('efface entièrement la session au logout', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(session));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.demo('client'); });

    await act(async () => { await result.current.logout(); });

    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(await AsyncStorage.getItem('mehdi.auth')).toBeNull();
  });

  it('rafraîchit le jeton en silence après expiration, sans reconnexion manuelle', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(session));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.demo('client'); });

    const refreshedUser = { ...session.user, vehicles: [] };
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'Session expirée' }, 401))
      .mockResolvedValueOnce(jsonResponse({ token: 'access-2', refreshToken: 'refresh-2', user: session.user }))
      .mockResolvedValueOnce(jsonResponse(refreshedUser));

    await act(async () => { await result.current.refresh(); });

    expect(result.current.token).toBe('access-2');
    const stored = JSON.parse((await AsyncStorage.getItem('mehdi.auth'))!);
    expect(stored.token).toBe('access-2');
  });

  it('déconnecte automatiquement si le refresh token est lui aussi invalide', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(session));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.demo('client'); });

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'Session expirée' }, 401))
      .mockResolvedValueOnce(jsonResponse({ error: 'Session expirée, reconnectez-vous' }, 401));

    await act(async () => {
      await expect(result.current.refresh()).rejects.toThrow();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(await AsyncStorage.getItem('mehdi.auth')).toBeNull();
  });
});
