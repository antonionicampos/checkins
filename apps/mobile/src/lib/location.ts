import type { LatLng } from '@checkins/shared';
import * as Location from 'expo-location';

export class LocationPermissionError extends Error {
  constructor() {
    super('Precisamos da sua localização para mostrar lugares por perto e confirmar o check-in.');
  }
}

/** Posição atual do aparelho; pede a permissão na primeira vez. */
export async function getCurrentPosition(): Promise<LatLng> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new LocationPermissionError();
  const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lat: coords.latitude, lng: coords.longitude };
}
