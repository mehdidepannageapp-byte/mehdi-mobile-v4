import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  notificationPreference: { findUnique: vi.fn() },
}));
vi.mock('../config/prisma.js', () => ({ prisma: prismaMock }));

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', fetchMock);

const { sendPush } = await import('./notification.js');

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue({ ok: true });
});

describe('sendPush', () => {
  it('n’envoie rien si le destinataire n’a pas de jeton push', async () => {
    await sendPush({ id: 'user-1', pushToken: null }, 'Titre', 'Corps');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('envoie la notification quand aucune préférence n’est enregistrée (activé par défaut)', async () => {
    prismaMock.notificationPreference.findUnique.mockResolvedValue(null);
    await sendPush({ id: 'user-1', pushToken: 'token-1' }, 'Titre', 'Corps');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('n’envoie rien si le destinataire a désactivé le push (B06)', async () => {
    prismaMock.notificationPreference.findUnique.mockResolvedValue({ userId: 'user-1', pushEnabled: false });
    await sendPush({ id: 'user-1', pushToken: 'token-1' }, 'Titre', 'Corps');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ne bloque pas l’appelant si le fournisseur push est indisponible', async () => {
    prismaMock.notificationPreference.findUnique.mockResolvedValue(null);
    fetchMock.mockRejectedValue(new Error('provider down'));
    await expect(sendPush({ id: 'user-1', pushToken: 'token-1' }, 'Titre', 'Corps')).resolves.toBeUndefined();
  });
});
