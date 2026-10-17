import { PHOTO_MAX_BYTES, toGeoPoint } from '@checkins/shared';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectMongo, disconnectMongo } from '../db.js';
import { CheckinModel } from '../models/checkin.js';
import { PhotoModel } from '../models/photo.js';
import { PlaceModel } from '../models/place.js';
import { UserModel } from '../models/user.js';
import { authHeader, buildTestApp, TEST_MEDIA_DIR, TEST_MONGO_URL } from '../test/setup.js';

const barPos = { lat: -23.5614, lng: -46.6559 };
const near = { lat: barPos.lat + 0.0003, lng: barPos.lng };

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 1)]);
const PDF = Buffer.from('%PDF-1.4\n%fake\n');

/** Corpo multipart/form-data com a legenda (opcional) antes do arquivo, como o app manda. */
function multipart(data: Buffer, caption?: string) {
  const boundary = '----checkins-test';
  const parts = [
    ...(caption !== undefined
      ? [Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`)]
      : []),
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="foto.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ];
  return { payload: Buffer.concat(parts), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

describe.skipIf(!TEST_MONGO_URL)('fotos e perfil', async () => {
  const app = await buildTestApp();
  let barId = '';

  beforeAll(async () => {
    await connectMongo(TEST_MONGO_URL!);
    await Promise.all([PlaceModel.syncIndexes(), CheckinModel.syncIndexes(), UserModel.syncIndexes(), PhotoModel.syncIndexes()]);
  });

  beforeEach(async () => {
    await Promise.all([PlaceModel.deleteMany({}), CheckinModel.deleteMany({}), UserModel.deleteMany({}), PhotoModel.deleteMany({})]);
    const bar = await PlaceModel.create({ name: 'Bar', category: 'bar', location: toGeoPoint(barPos) });
    barId = bar.id as string;
  });

  afterAll(async () => {
    await app.close();
    await disconnectMongo();
  });

  async function arrive(uid: string) {
    await app.inject({ method: 'POST', url: `/places/${barId}/checkins`, headers: authHeader(uid), payload: { position: near } });
  }

  function upload(uid: string, data: Buffer, caption?: string) {
    const { payload, headers } = multipart(data, caption);
    return app.inject({ method: 'POST', url: `/places/${barId}/photos`, headers: { ...authHeader(uid), ...headers }, payload });
  }

  async function myId(uid: string): Promise<string> {
    return (await app.inject({ method: 'GET', url: '/me', headers: authHeader(uid) })).json().id;
  }

  it('posta foto com legenda e ela aparece no lugar, no perfil e nos números do perfil', async () => {
    await arrive('ana');
    const res = await upload('ana', JPEG, ' Vista do balcão ');
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ caption: 'Vista do balcão', mine: true, place: { id: barId, name: 'Bar' } });
    expect(res.json().url).toMatch(/^\/media\/photos\/[a-f0-9]{32}\.jpg$/);
    await upload('ana', JPEG);

    const place = await app.inject({ method: 'GET', url: `/places/${barId}/photos`, headers: authHeader('bia') });
    expect(place.json().photos).toHaveLength(2);
    expect(place.json().photos[1]).toMatchObject({ caption: 'Vista do balcão', mine: false, author: { displayName: 'ana' } });

    const anaId = await myId('ana');
    const photos = await app.inject({ method: 'GET', url: `/users/${anaId}/photos?limit=1`, headers: authHeader('bia') });
    expect(photos.json().photos).toHaveLength(1);
    const older = await app.inject({
      method: 'GET',
      url: `/users/${anaId}/photos?before=${encodeURIComponent(photos.json().photos[0].createdAt)}`,
      headers: authHeader('bia'),
    });
    expect(older.json().photos.map((p: { caption?: string }) => p.caption)).toEqual(['Vista do balcão']);

    const profile = await app.inject({ method: 'GET', url: `/users/${anaId}`, headers: authHeader('bia') });
    expect(profile.json()).toMatchObject({ displayName: 'ana', isMe: false, checkinCount: 1, placeCount: 1, photoCount: 2 });
    expect(profile.json().email).toBeUndefined();
    const mine = await app.inject({ method: 'GET', url: `/users/${anaId}`, headers: authHeader('ana') });
    expect(mine.json().isMe).toBe(true);

    const file = await app.inject({ method: 'GET', url: res.json().url });
    expect(file.statusCode).toBe(200);
    expect(file.rawPayload.equals(JPEG)).toBe(true);
  });

  it('exige check-in no lugar e só aceita imagem', async () => {
    expect((await upload('ana', JPEG)).statusCode).toBe(422);
    await arrive('ana');
    expect((await upload('ana', PDF)).statusCode).toBe(415);
    expect((await upload('ana', JPEG, 'x'.repeat(201))).statusCode).toBe(400);
    expect((await upload('ana', Buffer.concat([JPEG, Buffer.alloc(PHOTO_MAX_BYTES)]))).statusCode).toBe(413);
    expect(await PhotoModel.countDocuments()).toBe(0);
  });

  it('só quem postou apaga a foto, e o arquivo sai do disco', async () => {
    await arrive('ana');
    const { id, url } = (await upload('ana', JPEG)).json();
    const path = join(TEST_MEDIA_DIR, url.replace('/media/', ''));
    expect(existsSync(path)).toBe(true);
    expect((await app.inject({ method: 'DELETE', url: `/photos/${id}`, headers: authHeader('bia') })).statusCode).toBe(403);
    expect((await app.inject({ method: 'DELETE', url: `/photos/${id}`, headers: authHeader('ana') })).statusCode).toBe(204);
    expect(existsSync(path)).toBe(false);
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(404);
  });

  it('perfil de quem não existe dá 404, e pastas de mídia fora da lista também', async () => {
    const missing = '64b000000000000000000000';
    expect((await app.inject({ method: 'GET', url: `/users/${missing}`, headers: authHeader('ana') })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/users/xyz/photos`, headers: authHeader('ana') })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/users/${missing}` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: `/media/outra/${'a'.repeat(32)}.jpg` })).statusCode).toBe(404);
  });
});
