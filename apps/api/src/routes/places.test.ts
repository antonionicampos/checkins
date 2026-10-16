import { toGeoPoint } from '@checkins/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectMongo, disconnectMongo } from '../db.js';
import { PlaceModel } from '../models/place.js';
import { buildTestApp, TEST_MONGO_URL } from '../test/setup.js';

// Precisa de um MongoDB de verdade: MONGO_URL_TEST no ambiente (veja .env.example).
describe.skipIf(!TEST_MONGO_URL)('rotas de lugares', async () => {
  const app = await buildTestApp();
  const center = { lat: -23.5614, lng: -46.6559 };

  beforeAll(async () => {
    await connectMongo(TEST_MONGO_URL!);
    await PlaceModel.deleteMany({});
    await PlaceModel.syncIndexes();
    await PlaceModel.create([
      { name: 'Perto', category: 'bar', location: toGeoPoint({ lat: center.lat + 0.0005, lng: center.lng }) },
      { name: 'Longe', category: 'bar', location: toGeoPoint({ lat: center.lat + 0.05, lng: center.lng }) },
      { name: 'Café perto', category: 'cafe', location: toGeoPoint(center) },
    ]);
  });

  afterAll(async () => {
    await app.close();
    await disconnectMongo();
  });

  it('GET /health fica "ok" com o banco conectado', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
  });

  it('lista só os lugares dentro do raio, do mais próximo ao mais distante', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/places/nearby?lat=${center.lat}&lng=${center.lng}&radius=500`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().places.map((p: { name: string }) => p.name)).toEqual(['Café perto', 'Perto']);
  });

  it('filtra por categoria', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/places/nearby?lat=${center.lat}&lng=${center.lng}&radius=500&category=bar`,
    });
    expect(res.json().places.map((p: { name: string }) => p.name)).toEqual(['Perto']);
  });

  it('responde 400 sem latitude e longitude', async () => {
    const res = await app.inject({ method: 'GET', url: '/places/nearby' });
    expect(res.statusCode).toBe(400);
  });

  it('responde 404 para um lugar inexistente', async () => {
    const res = await app.inject({ method: 'GET', url: '/places/000000000000000000000000' });
    expect(res.statusCode).toBe(404);
  });
});
