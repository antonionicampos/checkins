import type { HealthResponse, Place, PlaceCategory, UpdateMeInput, User } from '@checkins/shared';
import { auth } from './firebase';

/**
 * Endereço da API. No celular com Expo Go, use o IP da máquina na rede local
 * (ex.: http://192.168.0.10:3000), não "localhost". Configure em apps/mobile/.env.
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Chama a API mandando o token do Firebase de quem está logado (renovado sozinho quando expira). */
async function request<T>(path: string, init: RequestInit = {}, okStatuses: number[] = []): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok && !okStatuses.includes(res.status)) {
    throw new ApiError(res.status, body.error ?? `A API respondeu ${res.status}`);
  }
  return body;
}

export function getHealth() {
  // 503 também traz o corpo com o estado de cada serviço.
  return request<HealthResponse>('/health', {}, [503]);
}

export function getNearbyPlaces(params: { lat: number; lng: number; radius?: number; category?: PlaceCategory }) {
  const qs = new URLSearchParams({
    lat: String(params.lat),
    lng: String(params.lng),
    ...(params.radius ? { radius: String(params.radius) } : {}),
    ...(params.category ? { category: params.category } : {}),
  });
  return request<{ places: Place[] }>(`/places/nearby?${qs}`);
}

export function getMe() {
  return request<User>('/me');
}

export function updateMe(input: UpdateMeInput) {
  return request<User>('/me', { method: 'PATCH', body: JSON.stringify(input) });
}
