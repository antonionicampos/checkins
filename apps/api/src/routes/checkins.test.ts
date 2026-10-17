import { PRESENCE_RADIUS_METERS, toGeoPoint } from '@checkins/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectMongo, disconnectMongo } from '../db.js';
import { CheckinModel } from '../models/checkin.js';
import { PlaceModel } from '../models/place.js';
import { UserModel } from '../models/user.js';
import { authHeader, buildTestApp, TEST_MONGO_URL } from '../test/setup.js';

const barPos = { lat: -23.5614, lng: -46.6559 };
const cafePos = { lat: -23.5700, lng: -46.6500 };
const near = { lat: barPos.lat + 0.0003, lng: barPos.lng }; // ~33 m
const far = { lat: barPos.lat + 0.004, lng: barPos.lng }; // ~445 m, fora do raio

describe.skipIf(!TEST_MONGO_URL)('check-in', async () => {
  const app = await buildTestApp();
  let barId = '';
  let cafeId = '';

  beforeAll(async () => {
    await connectMongo(TEST_MONGO_URL!);
    await Promise.all([PlaceModel.syncIndexes(), CheckinModel.syncIndexes(), UserModel.syncIndexes()]);
  });

  beforeEach(async () => {
    await Promise.all([PlaceModel.deleteMany({}), CheckinModel.deleteMany({}), UserModel.deleteMany({})]);
    const [bar, cafe] = await PlaceModel.create([
      { name: 'Bar', category: 'bar', location: toGeoPoint(barPos) },
      { name: 'Café', category: 'cafe', location: toGeoPoint(cafePos) },
    ]);
    barId = bar!.id as string;
    cafeId = cafe!.id as string;
  });

  afterAll(async () => {
    await app.close();
    await disconnectMongo();
  });

  const checkin = (uid: string, placeId: string, body: object) =>
    app.inject({ method: 'POST', url: `/places/${placeId}/checkins`, headers: authHeader(uid), payload: body });
  const presence = (uid: string, placeId: string) =>
    app.inject({ method: 'GET', url: `/places/${placeId}/presence`, headers: authHeader(uid) });

  it('exige login', async () => {
    const res = await app.inject({ method: 'POST', url: `/places/${barId}/checkins`, payload: { position: near } });
    expect(res.statusCode).toBe(401);
  });

  it('faz check-in perto do lugar, com comentário e nota', async () => {
    const res = await checkin('ana', barId, { position: near, comment: 'Chope gelado', rating: 5 });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      placeId: barId,
      comment: 'Chope gelado',
      rating: 5,
      visible: true,
      author: { displayName: 'ana' },
    });
    const hours = (Date.parse(res.json().presenceUntil) - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(2.9);
  });

  it('recusa check-in longe do lugar', async () => {
    const res = await checkin('ana', barId, { position: far });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toContain(`${PRESENCE_RADIUS_METERS} m`);
  });

  it('responde 404 para lugar inexistente e 400 sem posição', async () => {
    expect((await checkin('ana', '000000000000000000000000', { position: near })).statusCode).toBe(404);
    expect((await checkin('ana', barId, {})).statusCode).toBe(400);
  });

  it('só mostra quem está no local para quem também está lá', async () => {
    await checkin('ana', barId, { position: near, comment: 'Oi!' });
    await checkin('bia', barId, { position: near });
    await checkin('caio', barId, { position: near, visible: false });

    const outsider = await presence('davi', barId);
    expect(outsider.json()).toEqual({ present: false, people: [] });

    const bia = await presence('bia', barId);
    expect(bia.json().present).toBe(true);
    expect(bia.json().myCheckin.author.displayName).toBe('bia');
    // Caio escolheu não aparecer; Bia não vê a si mesma.
    expect(bia.json().people.map((p: { author: { displayName: string } }) => p.author.displayName)).toEqual(['ana']);
  });

  it('um novo check-in encerra a presença anterior', async () => {
    await checkin('ana', barId, { position: near });
    await checkin('bia', barId, { position: near });
    await checkin('ana', cafeId, { position: cafePos });

    const bia = await presence('bia', barId);
    expect(bia.json().people).toEqual([]);
    expect((await presence('ana', cafeId)).json().present).toBe(true);
  });

  it('sair do local encerra a presença', async () => {
    await checkin('ana', barId, { position: near });
    const res = await app.inject({ method: 'DELETE', url: '/me/presence', headers: authHeader('ana') });
    expect(res.statusCode).toBe(204);
    expect((await presence('ana', barId)).json().present).toBe(false);
  });

  it('lista comentários recentes e a média das notas', async () => {
    await checkin('ana', barId, { position: near, comment: 'Bom', rating: 4 });
    await checkin('bia', barId, { position: near, rating: 5 });
    await checkin('caio', barId, { position: near }); // sem comentário nem nota: não entra

    const res = await app.inject({ method: 'GET', url: `/places/${barId}/checkins`, headers: authHeader('davi') });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ averageRating: 4.5, ratingCount: 2 });
    expect(res.json().recent).toHaveLength(2);
  });
});
