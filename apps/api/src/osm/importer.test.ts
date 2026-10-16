import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectMongo, disconnectMongo } from '../db.js';
import { PlaceModel } from '../models/place.js';
import { TEST_MONGO_URL } from '../test/setup.js';
import { fetchOsmElements, upsertOsmPlaces } from './importer.js';
import type { OverpassElement } from './mapping.js';

const elements: OverpassElement[] = [
  { type: 'node', id: 1, lat: -23.56, lon: -46.65, tags: { amenity: 'bar', name: 'Bar A', 'addr:street': 'Rua 1' } },
  { type: 'way', id: 2, center: { lat: -23.57, lon: -46.66 }, tags: { amenity: 'restaurant', name: 'Restaurante B' } },
  { type: 'node', id: 3, lat: -23.58, lon: -46.67, tags: { amenity: 'bank', name: 'Banco' } },
];

describe('fetchOsmElements', () => {
  it('manda a consulta para a Overpass e devolve os elementos', async () => {
    let sentBody = '';
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      sentBody = String(init.body);
      return new Response(JSON.stringify({ elements }), { status: 200 });
    }) as typeof fetch;
    const result = await fetchOsmElements('São Paulo', 'https://exemplo/api', fakeFetch);
    expect(result).toHaveLength(3);
    expect(decodeURIComponent(sentBody.replace(/\+/g, ' '))).toContain('"name"="São Paulo"');
  });

  it('lança erro quando a Overpass falha', async () => {
    const fakeFetch = (async () => new Response('ocupado', { status: 429 })) as typeof fetch;
    await expect(fetchOsmElements('São Paulo', 'https://exemplo/api', fakeFetch)).rejects.toThrow('429');
  });
});

describe.skipIf(!TEST_MONGO_URL)('upsertOsmPlaces', () => {
  beforeAll(async () => {
    await connectMongo(TEST_MONGO_URL!);
    await PlaceModel.deleteMany({});
    await PlaceModel.syncIndexes();
  });

  afterAll(() => disconnectMongo());

  it('cria os lugares e ignora os de categoria desconhecida', async () => {
    const result = await upsertOsmPlaces(elements);
    expect(result).toEqual({ received: 3, skipped: 1, created: 2, updated: 0 });
    expect(await PlaceModel.countDocuments()).toBe(2);
  });

  it('rodar de novo atualiza em vez de duplicar', async () => {
    const renamed = elements.map((e) => (e.id === 1 ? { ...e, tags: { ...e.tags, name: 'Bar A Novo' } } : e));
    const result = await upsertOsmPlaces(renamed, 1);
    expect(result).toMatchObject({ created: 0, updated: 2 });
    expect(await PlaceModel.countDocuments()).toBe(2);
    const bar = await PlaceModel.findOne({ 'source.externalId': 'node/1' });
    expect(bar?.name).toBe('Bar A Novo');
    expect(bar?.address).toBe('Rua 1');
  });
});
