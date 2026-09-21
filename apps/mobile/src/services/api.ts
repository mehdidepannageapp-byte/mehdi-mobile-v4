import { API_URL } from '../config';
import type { User } from '../types';

export type Session = { token: string; refreshToken: string; user: User };

let token: string | null = null;
let refreshTokenValue: string | null = null;
let onSessionRefreshed: ((session: Session) => void) | null = null;
let onSessionExpired: (() => void) | null = null;
let refreshInFlight: Promise<boolean> | null = null;

export function setApiToken(value: string | null) { token = value; }
export function setRefreshToken(value: string | null) { refreshTokenValue = value; }

/** Branché par AuthContext pour persister/effacer la session quand le jeton est rafraîchi en silence. */
export function setSessionHandlers(handlers: { onSessionRefreshed?: (session: Session) => void; onSessionExpired?: () => void }) {
  onSessionRefreshed = handlers.onSessionRefreshed ?? null;
  onSessionExpired = handlers.onSessionExpired ?? null;
}

async function performRefresh(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refreshTokenValue }),
    });
    if (!response.ok) throw new Error('Rafraîchissement du jeton refusé');
    const session = await response.json() as Session;
    token = session.token;
    refreshTokenValue = session.refreshToken;
    onSessionRefreshed?.(session);
    return true;
  } catch {
    token = null;
    refreshTokenValue = null;
    onSessionExpired?.();
    return false;
  }
}

/** Rafraîchit le jeton d'accès expiré, sans reconnexion manuelle. Les appels concurrents partagent la même tentative. */
function tryRefresh(): Promise<boolean> {
  if (!refreshTokenValue) return Promise.resolve(false);
  if (!refreshInFlight) refreshInFlight = performRefresh().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

async function uploadPhoto(bookingId: string, kind: string, uri: string, isRetry = false): Promise<unknown> {
  const form = new FormData();
  form.append('kind', kind);
  form.append('photo', { uri, name: `photo-${Date.now()}.jpg`, type: 'image/jpeg' } as unknown as Blob);
  const response = await fetch(`${API_URL}/bookings/${bookingId}/photos/upload`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
  if (response.status === 401 && !isRetry && (await tryRefresh())) return uploadPhoto(bookingId, kind, uri, true);
  if (!response.ok) throw new Error('Envoi de la photo impossible');
  return response.json();
}

async function request<T>(path: string, options: RequestInit = {}, isRetry = false): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  });
  if (response.status === 401 && !isRetry && path !== '/auth/refresh' && (await tryRefresh())) {
    return request<T>(path, options, true);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Erreur de connexion' })) as { error?: string };
    throw new Error(body.error ?? `Erreur ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  requestOtp: (phone: string) => request<void>('/auth/request-otp', { method: 'POST', body: JSON.stringify({ phone }) }),
  verifyOtp: (phone: string, code: string, firstName?: string) => request<Session>('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ phone, code, firstName }) }),
  demo: (role: 'client' | 'driver') => request<Session>(`/auth/demo/${role}`, { method: 'POST' }),
  me: () => request<import('../types').User & { vehicles: import('../types').Vehicle[] }>('/auth/me'),
  updateMe: (data: object) => request<import('../types').User>('/auth/me', { method: 'PATCH', body: JSON.stringify(data) }),
  deleteMe: () => request<void>('/auth/me', { method: 'DELETE' }),
  places: (query: string) => request<Array<{ id: string; description: string }>>(`/places/autocomplete?query=${encodeURIComponent(query)}`),
  place: (id: string) => request<import('../types').Place & { inServiceArea: boolean }>(`/places/details/${encodeURIComponent(id)}`),
  vehicles: () => request<import('../types').Vehicle[]>('/vehicles'),
  createVehicle: (data: object) => request<import('../types').Vehicle>('/vehicles', { method: 'POST', body: JSON.stringify(data) }),
  estimate: (data: object) => request<{ amountCents: number; currency: string; provisional: boolean }>('/bookings/estimate', { method: 'POST', body: JSON.stringify(data) }),
  createBooking: (data: object) => request<import('../types').Booking>('/bookings', { method: 'POST', body: JSON.stringify(data) }),
  authorizePayment: (id: string) => request<{ clientSecret: string }>(`/bookings/${id}/payment-intent`, { method: 'POST' }),
  confirmPayment: (id: string) => request<import('../types').Booking>(`/bookings/${id}/payment-confirmed`, { method: 'POST' }),
  bookings: () => request<import('../types').Booking[]>('/bookings'),
  booking: (id: string) => request<import('../types').Booking>(`/bookings/${id}`),
  updateStatus: (id: string, status: import('../types').BookingStatus, extra?: { cashReceived?: boolean }) => request<import('../types').Booking>(`/bookings/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, ...extra }) }),
  refuse: (id: string, delayMinutes: 30 | 60 | 90) => request<import('../types').Booking>(`/bookings/${id}/refuse`, { method: 'POST', body: JSON.stringify({ delayMinutes }) }),
  acceptProposal: (id: string) => request<import('../types').Booking>(`/bookings/${id}/proposal/accept`, { method: 'POST' }),
  cancel: (id: string, reason?: string) => request<import('../types').Booking>(`/bookings/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  addPhoto: (id: string, kind: string, url: string) => request(`/bookings/${id}/photos`, { method: 'POST', body: JSON.stringify({ kind, url }) }),
  uploadPhoto,
  sendMessage: (id: string, body: string) => request<import('../types').Message>(`/bookings/${id}/messages`, { method: 'POST', body: JSON.stringify({ body }) }),
  review: (id: string, rating: number, comment?: string) => request(`/bookings/${id}/review`, { method: 'POST', body: JSON.stringify({ rating, comment }) }),
  driverAvailability: (available: boolean) => request<import('../types').User>('/driver/availability', { method: 'PATCH', body: JSON.stringify({ available }) }),
  driverDashboard: () => request<{ user: import('../types').User; active?: import('../types').Booking; stats: { completedCount: number; monthRevenueCents: number; totalRevenueCents: number } }>('/driver/dashboard'),
};
