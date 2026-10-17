import { toGeoPoint } from '@checkins/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectMongo, disconnectMongo } from '../db.js';
import { CheckinModel } from '../models/checkin.js';
import { GroupMessageModel, GroupModel } from '../models/group.js';
import { PlaceModel } from '../models/place.js';
import { UserModel } from '../models/user.js';
import { authHeader, buildTestApp, TEST_MONGO_URL } from '../test/setup.js';

const barPos = { lat: -23.5614, lng: -46.6559 };
const near = { lat: barPos.lat + 0.0003, lng: barPos.lng }; // ~33 m
const far = { lat: barPos.lat + 0.004, lng: barPos.lng }; // ~445 m

describe.skipIf(!TEST_MONGO_URL)('grupos no local', async () => {
  const events: { uid: string; event: string; payload: any }[] = [];
  const app = await buildTestApp({ notify: (uid, event, payload) => events.push({ uid, event, payload }) });
  let barId = '';

  beforeAll(async () => {
    await connectMongo(TEST_MONGO_URL!);
    await Promise.all([
      PlaceModel.syncIndexes(),
      CheckinModel.syncIndexes(),
      UserModel.syncIndexes(),
      GroupModel.syncIndexes(),
      GroupMessageModel.syncIndexes(),
    ]);
  });

  beforeEach(async () => {
    await Promise.all([
      PlaceModel.deleteMany({}),
      CheckinModel.deleteMany({}),
      UserModel.deleteMany({}),
      GroupModel.deleteMany({}),
      GroupMessageModel.deleteMany({}),
    ]);
    events.length = 0;
    const bar = await PlaceModel.create({ name: 'Bar', category: 'bar', location: toGeoPoint(barPos) });
    barId = bar.id as string;
  });

  afterAll(async () => {
    await app.close();
    await disconnectMongo();
  });

  const call = (uid: string, method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, headers: authHeader(uid), ...(payload ? { payload } : {}) });

  const create = (uid: string, body: object = {}) =>
    call(uid, 'POST', `/places/${barId}/groups`, { position: near, name: 'Mesa do fundo', ...body });

  async function arrive(uid: string): Promise<string> {
    const res = await call(uid, 'POST', `/places/${barId}/checkins`, { position: near });
    return res.json().author.id;
  }

  it('cria grupo estando no lugar, com prazo ou sem prazo', async () => {
    const temp = await create('ana', { durationHours: 4, description: 'Quem curte samba' });
    expect(temp.statusCode).toBe(201);
    expect(temp.json()).toMatchObject({
      name: 'Mesa do fundo',
      isAdmin: true,
      isMember: true,
      memberCount: 1,
      place: { id: barId, name: 'Bar' },
      admin: { displayName: 'ana' },
    });
    const hours = (Date.parse(temp.json().expiresAt) - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(3.9);

    const forever = await create('ana');
    expect(forever.json().expiresAt).toBeUndefined();

    const list = await call('bia', 'GET', `/places/${barId}/groups`);
    expect(list.json().groups).toHaveLength(2);
    expect(list.json().groups[0]).toMatchObject({ isMember: false, isAdmin: false });
  });

  it('recusa criar longe do lugar e com dados inválidos', async () => {
    const res = await create('ana', { position: far });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toContain('criar um grupo');
    expect((await create('ana', { name: '' })).statusCode).toBe(400);
    expect((await create('ana', { durationHours: 5 })).statusCode).toBe(400);
  });

  it('esconde grupos vencidos', async () => {
    const { id } = (await create('ana', { durationHours: 2 })).json();
    await GroupModel.updateOne({ _id: id }, { expiresAt: new Date(Date.now() - 1000) });
    expect((await call('ana', 'GET', `/places/${barId}/groups`)).json().groups).toEqual([]);
    expect((await call('ana', 'GET', `/groups/${id}`)).statusCode).toBe(404);
  });

  it('entra com check-in, conversa e recebe em tempo real', async () => {
    const { id } = (await create('ana')).json();

    // Sem check-in no lugar não entra nem lê.
    expect((await call('bia', 'POST', `/groups/${id}/join`)).statusCode).toBe(422);
    expect((await call('bia', 'GET', `/groups/${id}/messages`)).statusCode).toBe(403);

    await arrive('bia');
    const joined = await call('bia', 'POST', `/groups/${id}/join`);
    expect(joined.json()).toMatchObject({ isMember: true, memberCount: 2 });
    // Entrar de novo não duplica.
    expect((await call('bia', 'POST', `/groups/${id}/join`)).json().memberCount).toBe(2);

    events.length = 0;
    const sent = await call('bia', 'POST', `/groups/${id}/messages`, { text: 'Oi, gente' });
    expect(sent.statusCode).toBe(201);
    expect(sent.json()).toMatchObject({ text: 'Oi, gente', sender: { displayName: 'bia' } });
    expect(events.filter((e) => e.event === 'group:message').map((e) => e.uid).sort()).toEqual(['ana', 'bia']);

    const history = await call('ana', 'GET', `/groups/${id}/messages`);
    expect(history.json().messages.map((m: { text: string }) => m.text)).toEqual(['Oi, gente']);

    const detail = await call('ana', 'GET', `/groups/${id}`);
    expect(detail.json().members.map((m: { displayName: string }) => m.displayName)).toEqual(['ana', 'bia']);

    const mine = await call('bia', 'GET', '/me/groups');
    expect(mine.json().groups.map((g: { id: string }) => g.id)).toEqual([id]);
  });

  it('membro sai; administrador não sai, remove e encerra', async () => {
    const { id } = (await create('ana')).json();
    const biaId = await arrive('bia');
    await arrive('caio');
    await call('bia', 'POST', `/groups/${id}/join`);
    await call('caio', 'POST', `/groups/${id}/join`);

    expect((await call('caio', 'POST', `/groups/${id}/leave`)).statusCode).toBe(204);
    expect((await call('caio', 'GET', `/groups/${id}/messages`)).statusCode).toBe(403);
    expect((await call('ana', 'POST', `/groups/${id}/leave`)).statusCode).toBe(403);

    // Só o administrador remove; quem foi removido não volta.
    expect((await call('caio', 'DELETE', `/groups/${id}/members/${biaId}`)).statusCode).toBe(403);
    expect((await call('ana', 'DELETE', `/groups/${id}/members/${biaId}`)).statusCode).toBe(204);
    expect((await call('bia', 'POST', `/groups/${id}/join`)).statusCode).toBe(403);
    expect((await call('ana', 'DELETE', `/groups/${id}/members/${biaId}`)).statusCode).toBe(404);

    await call('ana', 'POST', `/groups/${id}/messages`, { text: 'Fechando' });
    expect((await call('caio', 'DELETE', `/groups/${id}`)).statusCode).toBe(403);
    expect((await call('ana', 'DELETE', `/groups/${id}`)).statusCode).toBe(204);
    expect((await call('ana', 'GET', `/groups/${id}`)).statusCode).toBe(404);
    expect(await GroupMessageModel.countDocuments({ groupId: id })).toBe(0);
  });

  it('mensagem de grupo temporário vence junto com o grupo', async () => {
    const { id, expiresAt } = (await create('ana', { durationHours: 2 })).json();
    await call('ana', 'POST', `/groups/${id}/messages`, { text: 'Oi' });
    const msg = await GroupMessageModel.findOne({ groupId: id });
    expect(msg?.expiresAt?.toISOString()).toBe(expiresAt);
  });
});
