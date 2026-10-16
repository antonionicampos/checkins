import { describe, expect, it } from 'vitest';
import { distanceInMeters, toGeoPoint } from './geo.js';
import { createCheckinSchema } from './checkins.js';

describe('geo', () => {
  it('converte lat/lng para GeoJSON na ordem [lng, lat]', () => {
    expect(toGeoPoint({ lat: -22.9, lng: -43.2 })).toEqual({
      type: 'Point',
      coordinates: [-43.2, -22.9],
    });
  });

  it('calcula distâncias curtas com precisão de metros', () => {
    // ~111 m por 0,001 grau de latitude
    const d = distanceInMeters({ lat: -22.9, lng: -43.2 }, { lat: -22.901, lng: -43.2 });
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });
});

describe('createCheckinSchema', () => {
  it('deixa o check-in visível por padrão', () => {
    const parsed = createCheckinSchema.parse({ position: { lat: 0, lng: 0 } });
    expect(parsed.visible).toBe(true);
  });

  it('rejeita nota fora de 1 a 5', () => {
    expect(() => createCheckinSchema.parse({ position: { lat: 0, lng: 0 }, rating: 6 })).toThrow();
  });
});
