import { MENU_MAX_BYTES, toGeoPoint } from '@checkins/shared';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectMongo, disconnectMongo } from '../db.js';
import { CheckinModel } from '../models/checkin.js';
import { MenuModel } from '../models/menu.js';
import { PlaceModel } from '../models/place.js';
import { UserModel } from '../models/user.js';
import { authHeader, buildTestApp, TEST_MEDIA_DIR, TEST_MONGO_URL } from '../test/setup.js';

const barPos = { lat: -23.5614, lng: -46.6559 };
const near = { lat: barPos.lat + 0.0003, lng: barPos.lng };

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 1)]);
const PDF = Buffer.from('%PDF-1.4\n%fake\n');

/** Monta um corpo multipart/form-data com um arquivo no campo "file". */
function multipart(data: Buffer, filename: string, type: string) {
  const boundary = '----checkins-test';
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`,
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload: body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

describe.skipIf(!TEST_MONGO_URL)('cardápios', async () => {
  const app = await buildTestApp();
  let barId = '';

  beforeAll(async () => {
    await connectMongo(TEST_MONGO_URL!);
    await Promise.all([PlaceModel.syncIndexes(), CheckinModel.syncIndexes(), UserModel.syncIndexes(), MenuModel.syncIndexes()]);
  });

  beforeEach(async () => {
    await Promise.all([PlaceModel.deleteMany({}), CheckinModel.deleteMany({}), UserModel.deleteMany({}), MenuModel.deleteMany({})]);
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

  function upload(uid: string, data: Buffer, filename = 'cardapio.jpg', type = 'image/jpeg') {
    const { payload, headers } = multipart(data, filename, type);
    return app.inject({ method: 'POST', url: `/places/${barId}/menus`, headers: { ...authHeader(uid), ...headers }, payload });
  }

  it('envia foto e PDF, lista e serve o arquivo', async () => {
    await arrive('ana');
    const photo = await upload('ana', JPEG);
    expect(photo.statusCode).toBe(201);
    expect(photo.json()).toMatchObject({ kind: 'image', mine: true, outdatedCount: 0, uploadedBy: { displayName: 'ana' } });
    expect(photo.json().url).toMatch(/^\/media\/menus\/[a-f0-9]{32}\.jpg$/);

    // O tipo vem do conteúdo, não do nome que o celular mandou.
    const pdf = await upload('ana', PDF, 'foto.jpg', 'image/jpeg');
    expect(pdf.json().kind).toBe('pdf');
    expect(pdf.json().url).toMatch(/\.pdf$/);

    const list = await app.inject({ method: 'GET', url: `/places/${barId}/menus`, headers: authHeader('bia') });
    expect(list.json().menus.map((m: { kind: string }) => m.kind)).toEqual(['pdf', 'image']);
    expect(list.json().menus[0].mine).toBe(false);

    const file = await app.inject({ method: 'GET', url: photo.json().url });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('image/jpeg');
    expect(file.rawPayload.equals(JPEG)).toBe(true);
  });

  it('exige check-in no lugar e recusa arquivos que não são foto nem PDF', async () => {
    expect((await upload('ana', JPEG)).statusCode).toBe(422);
    await arrive('ana');
    expect((await upload('ana', Buffer.from('MZ executável'), 'x.jpg')).statusCode).toBe(415);
    const big = Buffer.concat([JPEG, Buffer.alloc(MENU_MAX_BYTES)]);
    expect((await upload('ana', big)).statusCode).toBe(413);
    expect(await MenuModel.countDocuments()).toBe(0);
  });

  it('marca como desatualizado e só quem enviou apaga', async () => {
    await arrive('ana');
    const { id, url } = (await upload('ana', JPEG)).json();
    const path = join(TEST_MEDIA_DIR, url.replace('/media/', ''));
    expect(existsSync(path)).toBe(true);

    const marked = await app.inject({ method: 'POST', url: `/menus/${id}/outdated`, headers: authHeader('bia') });
    expect(marked.json()).toMatchObject({ outdatedCount: 1, markedOutdatedByMe: true });
    const unmarked = await app.inject({ method: 'POST', url: `/menus/${id}/outdated`, headers: authHeader('bia') });
    expect(unmarked.json()).toMatchObject({ outdatedCount: 0, markedOutdatedByMe: false });

    expect((await app.inject({ method: 'DELETE', url: `/menus/${id}`, headers: authHeader('bia') })).statusCode).toBe(403);
    expect((await app.inject({ method: 'DELETE', url: `/menus/${id}`, headers: authHeader('ana') })).statusCode).toBe(204);
    expect(existsSync(path)).toBe(false);
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(404);
  });

  it('não serve nomes de arquivo fora do padrão', async () => {
    expect((await app.inject({ method: 'GET', url: '/media/menus/..%2F..%2Fetc%2Fpasswd' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/media/menus/abc.jpg' })).statusCode).toBe(404);
  });
});
