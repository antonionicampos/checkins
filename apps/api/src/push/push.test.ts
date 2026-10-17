import { toGeoPoint } from '@checkins/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectMongo, disconnectMongo } from '../db.js';
import { CheckinModel } from '../models/checkin.js';
import { ConversationModel, MessageModel } from '../models/conversation.js';
import { GroupMessageModel, GroupModel } from '../models/group.js';
import { PlaceModel } from '../models/place.js';
import { UserModel } from '../models/user.js';
import { authHeader, buildTestApp, TEST_MONGO_URL } from '../test/setup.js';
import { createExpoPushSender, type PushMessage } from './sender.js';

const barPos = { lat: -23.5614, lng: -46.6559 };
const near = { lat: barPos.lat + 0.0003, lng: barPos.lng };
const token = (name: string) => `ExponentPushToken[${name}]`;

describe('envio pelo Expo Push', () => {
  it('manda em lotes de 100 e avisa tokens de aparelhos que saíram', async () => {
    const calls: Array<Array<{ to: string }>> = [];
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const batch = JSON.parse(String(init!.body)) as Array<{ to: string }>;
      calls.push(batch);
      const data = batch.map((m) =>
        m.to === token('velho') ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok' },
      );
      return new Response(JSON.stringify({ data }), { status: 200 });
    });
    const invalid: string[] = [];
    const send = createExpoPushSender({
      log: { warn: () => {} },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      onInvalidToken: async (t) => {
        invalid.push(t);
      },
    });

    const to = [token('velho'), ...Array.from({ length: 150 }, (_, i) => token(`a${i}`))];
    send({ to, title: 'Oi', body: 'Mensagem', data: { url: '/conversations' } });
    await vi.waitFor(() => expect(invalid).toEqual([token('velho')]));
    expect(calls.map((c) => c.length)).toEqual([100, 51]);
    expect(calls[0]![0]).toMatchObject({ title: 'Oi', body: 'Mensagem', data: { url: '/conversations' } });
  });
});

describe.skipIf(!TEST_MONGO_URL)('notificações push', async () => {
  const pushes: PushMessage[] = [];
  const app = await buildTestApp({ push: (m) => pushes.push(m) });
  let barId = '';
  const models = [PlaceModel, CheckinModel, UserModel, ConversationModel, MessageModel, GroupModel, GroupMessageModel];

  beforeAll(async () => {
    await connectMongo(TEST_MONGO_URL!);
    await Promise.all(models.map((m) => (m as typeof UserModel).syncIndexes()));
  });

  beforeEach(async () => {
    await Promise.all(models.map((m) => (m as typeof UserModel).deleteMany()));
    pushes.length = 0;
    barId = (await PlaceModel.create({ name: 'Bar', category: 'bar', location: toGeoPoint(barPos) })).id as string;
  });

  afterAll(async () => {
    await app.close();
    await disconnectMongo();
  });

  const call = (uid: string, method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, headers: authHeader(uid), ...(payload ? { payload } : {}) });

  async function arrive(uid: string): Promise<string> {
    const res = await call(uid, 'POST', `/places/${barId}/checkins`, { position: near });
    await call(uid, 'POST', '/me/push-tokens', { token: token(uid) });
    return res.json().author.id;
  }

  it('registra o aparelho, passa para quem entrou por último e remove ao sair', async () => {
    expect((await call('ana', 'POST', '/me/push-tokens', { token: 'qualquer' })).statusCode).toBe(400);
    expect((await call('ana', 'POST', '/me/push-tokens', { token: token('cel') })).statusCode).toBe(204);
    await call('ana', 'POST', '/me/push-tokens', { token: token('cel') });
    expect((await UserModel.findOne({ firebaseUid: 'ana' }))?.pushTokens).toEqual([token('cel')]);

    // O mesmo celular, agora logado na conta da Bia.
    await call('bia', 'POST', '/me/push-tokens', { token: token('cel') });
    expect((await UserModel.findOne({ firebaseUid: 'ana' }))?.pushTokens).toEqual([]);
    expect((await call('bia', 'DELETE', '/me/push-tokens', { token: token('cel') })).statusCode).toBe(204);
    expect((await UserModel.findOne({ firebaseUid: 'bia' }))?.pushTokens).toEqual([]);
  });

  it('avisa convite, aceite e mensagem da conversa só para a outra pessoa', async () => {
    await arrive('ana');
    const biaId = await arrive('bia');
    const id = (await call('ana', 'POST', '/conversations', { userId: biaId, placeId: barId })).json().id;
    await call('bia', 'POST', `/conversations/${id}/accept`);
    await call('bia', 'POST', `/conversations/${id}/messages`, { text: 'Oi, tudo bem?' });

    expect(pushes).toEqual([
      { to: [token('bia')], title: 'Convite para conversar', body: 'ana quer conversar com você em Bar', data: { url: '/conversations' } },
      { to: [token('ana')], title: 'Convite aceito', body: 'bia aceitou conversar com você', data: { url: `/conversations/${id}` } },
      { to: [token('ana')], title: 'bia', body: 'Oi, tudo bem?', data: { url: `/conversations/${id}` } },
    ]);
  });

  it('avisa os outros membros do grupo, menos quem bloqueou quem mandou', async () => {
    const anaId = await arrive('ana');
    await arrive('bia');
    await arrive('caio');
    const groupId = (await call('ana', 'POST', `/places/${barId}/groups`, { position: near, name: 'Mesa 4' })).json().id;
    await call('bia', 'POST', `/groups/${groupId}/join`);
    await call('caio', 'POST', `/groups/${groupId}/join`);
    await call('caio', 'POST', `/users/${anaId}/block`);

    pushes.length = 0;
    await call('ana', 'POST', `/groups/${groupId}/messages`, { text: 'x'.repeat(200) });
    expect(pushes).toHaveLength(1);
    expect(pushes[0]).toMatchObject({ to: [token('bia')], title: 'Mesa 4', data: { url: `/groups/${groupId}` } });
    expect(pushes[0]!.body).toHaveLength(120);
    expect(pushes[0]!.body.startsWith('ana: x')).toBe(true);
  });
});
