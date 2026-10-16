import { describe, expect, it } from 'vitest';
import { buildOverpassQuery, elementToPlace } from './mapping.js';

describe('elementToPlace', () => {
  it('converte um bar (node) com endereço', () => {
    const place = elementToPlace({
      type: 'node',
      id: 123,
      lat: -23.56,
      lon: -46.65,
      tags: { amenity: 'pub', name: ' Bar do Zé ', 'addr:street': 'Rua Augusta', 'addr:housenumber': '100' },
    });
    expect(place).toEqual({
      name: 'Bar do Zé',
      category: 'bar',
      address: 'Rua Augusta, 100',
      location: { type: 'Point', coordinates: [-46.65, -23.56] },
      source: { provider: 'osm', externalId: 'node/123' },
    });
  });

  it('usa o centro de ways e mapeia academias', () => {
    const place = elementToPlace({
      type: 'way',
      id: 9,
      center: { lat: -23.5, lon: -46.6 },
      tags: { leisure: 'fitness_centre', name: 'Academia X' },
    });
    expect(place).toMatchObject({ category: 'academia', source: { externalId: 'way/9' } });
    expect(place?.location.coordinates).toEqual([-46.6, -23.5]);
  });

  it.each([
    ['fast_food', 'restaurante'],
    ['ice_cream', 'cafe'],
    ['nightclub', 'balada'],
  ])('amenity=%s vira %s', (amenity, category) => {
    const place = elementToPlace({ type: 'node', id: 1, lat: 0, lon: 0, tags: { amenity, name: 'X' } });
    expect(place?.category).toBe(category);
  });

  it('ignora elemento sem nome, sem posição ou de categoria desconhecida', () => {
    expect(elementToPlace({ type: 'node', id: 1, lat: 0, lon: 0, tags: { amenity: 'bar' } })).toBeNull();
    expect(elementToPlace({ type: 'way', id: 1, tags: { amenity: 'bar', name: 'X' } })).toBeNull();
    expect(elementToPlace({ type: 'node', id: 1, lat: 0, lon: 0, tags: { amenity: 'bank', name: 'X' } })).toBeNull();
  });
});

describe('buildOverpassQuery', () => {
  it('filtra o município e as categorias do app', () => {
    const q = buildOverpassQuery('São Paulo');
    expect(q).toContain('area["name"="São Paulo"]["boundary"="administrative"]["admin_level"="8"]');
    expect(q).toContain('restaurant');
    expect(q).toContain('fitness_centre');
    expect(q).toContain('out center tags;');
  });

  it('não deixa aspas do nome quebrarem a consulta', () => {
    expect(buildOverpassQuery('A"B')).toContain('"name"="AB"');
  });
});
