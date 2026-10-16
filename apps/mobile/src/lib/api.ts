import type { HealthResponse, Place, PlaceCategory } from '@checkins/shared';

/**
 * Endereço da API. No celular com Expo Go, use o IP da máquina na rede local
 * (ex.: http://192.168.0.10:3000), não "localhost". Configure em apps/mobile/.env.
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok && res.status !== 503) throw new Error(`API respondeu ${res.status}`);
  return (await res.json()) as T;
}

export function getHealth() {
  return get<HealthResponse>('/health');
}

export function getNearbyPlaces(params: { lat: number; lng: number; radius?: number; category?: PlaceCategory }) {
  const qs = new URLSearchParams({
    lat: String(params.lat),
    lng: String(params.lng),
    ...(params.radius ? { radius: String(params.radius) } : {}),
    ...(params.category ? { category: params.category } : {}),
  });
  return get<{ places: Place[] }>(`/places/nearby?${qs}`);
}
