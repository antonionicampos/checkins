import { toGeoPoint } from '@checkins/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectMongo, disconnectMongo } from '../db.js';
import { CheckinModel } from '../models/checkin.js';
import { ConversationModel, MessageModel } from '../models/conversation.js';
import { PlaceModel } from '../models/place.js';
import { UserModel } from '../models/user.js';
import { authHeader, buildTestApp, TEST_MONGO_URL } from '../test/setup.js';

const barPos = { lat: -23.5614, lng: -46.6559 };
const near = { lat: barPos.lat + 0.0003, lng: barPos.lng };

describe.skipIf(!TEST_MONGO_URL)('conversa direta', async () => {
  const events: { uid: string; event: string; payload: any }[] = [];
  const app = await buildTestApp({ notify: (uid, event, payload) => events.push({ uid, event, payload }) });
  let barId = '';
  let otherBarId = '';

  beforeAll(async () => {
    await connectMongo(TEST_MONGO_URL!);
    await Promise.all([
      PlaceModel.syncIndexes(),
      CheckinModel.syncIndexes(),
      UserModel.syncIndexes(),
      ConversationModel.syncIndexes(),
      MessageModel.syncIndexes(),
    ]);
  });

  beforeEach(async () => {
    await Promise.all([
      PlaceModel.deleteMany({}),
      CheckinModel.deleteMany({}),
      UserModel.deleteMany({}),
      ConversationModel.deleteMany({}),
      MessageModel.deleteMany({}),
    ]);
    events.length = 0;
    const [bar, otherBar] = await PlaceModel.create([
      { name: 'Bar', category: 'bar', location: toGeoPoint(barPos) },
      { name: 'Outro bar', category: 'bar', location: toGeoPoint({ lat: -23.6, lng: -46.7 }) },
    ]);
    barId = bar!.id as string;
    otherBarId = otherBar!.id as string;
  });

  afterAll(async () => {
    await app.close();
    await disconnectMongo();
  });

  const call = (uid: string, method: 'GET' | 'POST', url: string, payload?: object) =>
    app.inject({ method, url, headers: authHeader(uid), ...(payload ? { payload } : {}) });

  /** Faz check-in e devolve o id do usuário. */
  async function arrive(uid: string, visible = true): Promise<string> {
    const res = await call(uid, 'POST', `/places/${barId}/checkins`, { position: near, visible });
    expect(res.statusCode).toBe(201);
    return res.json().author.id;
  }

  async function invite(from: string, toId: string) {
    return call(from, 'POST', '/conversations', { userId: toId, placeId: barId });
  }

  it('convida, aceita e troca mensagens, com avisos em tempo real', async () => {
    await arrive('ana');
    const biaId = await arrive('bia');

    const created = await invite('ana', biaId);
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      status: 'pending',
      requestedByMe: true,
      other: { displayName: 'bia' },
      place: { id: barId, name: 'Bar' },
    });
    const id = created.json().id;
    expect(events.find((e) => e.uid === 'bia')?.payload).toMatchObject({ requestedByMe: false, status: 'pending' });

    // Antes do aceite não dá para mandar mensagem.
    expect((await call('ana', 'POST', `/conversations/${id}/messages`, { text: 'Oi' })).statusCode).toBe(403);
    // Quem convidou não aceita o próprio convite.
    expect((await call('ana', 'POST', `/conversations/${id}/accept`)).statusCode).toBe(403);

    const accepted = await call('bia', 'POST', `/conversations/${id}/accept`);
    expect(accepted.json()).toMatchObject({ status: 'accepted', requestedByMe: false, other: { displayName: 'ana' } });
    expect((await call('bia', 'POST', `/conversations/${id}/accept`)).statusCode).toBe(409);

    events.length = 0;
    const sent = await call('ana', 'POST', `/conversations/${id}/messages`, { text: '  Oi, tudo bem?  ' });
    expect(sent.statusCode).toBe(201);
    expect(sent.json().text).toBe('Oi, tudo bem?');
    expect(events.map((e) => [e.uid, e.event]).sort()).toEqual([
      ['ana', 'message:new'],
      ['bia', 'message:new'],
    ]);
    await call('bia', 'POST', `/conversations/${id}/messages`, { text: 'Tudo!' });

    const history = await call('bia', 'GET', `/conversations/${id}/messages`);
    expect(history.json().messages.map((m: { text: string }) => m.text)).toEqual(['Oi, tudo bem?', 'Tudo!']);

    const list = await call('ana', 'GET', '/conversations');
    expect(list.json().conversations).toHaveLength(1);
    expect(list.json().conversations[0].lastMessage.text).toBe('Tudo!');
  });

  it('só convida quem está no mesmo lugar e escolheu aparecer', async () => {
    const biaId = await arrive('bia');
    const caioId = await arrive('caio', false);

    // Ana ainda não fez check-in.
    expect((await invite('ana', biaId)).statusCode).toBe(422);

    await arrive('ana');
    expect((await invite('ana', caioId)).statusCode).toBe(422);
    expect(
      (await call('ana', 'POST', '/conversations', { userId: biaId, placeId: otherBarId })).statusCode,
    ).toBe(422);
    expect((await invite('ana', '000000000000000000000000')).statusCode).toBe(422);
  });

  it('não deixa convidar a si mesmo nem repetir convite', async () => {
    const anaId = await arrive('ana');
    const biaId = await arrive('bia');
    expect((await invite('ana', anaId)).statusCode).toBe(400);

    const first = await invite('ana', biaId);
    // Convite repetido (de qualquer lado) devolve a mesma conversa.
    const again = await invite('bia', anaId);
    expect(again.statusCode).toBe(200);
    expect(again.json().id).toBe(first.json().id);
  });

  it('convite recusado some da lista e não pode ser refeito', async () => {
    await arrive('ana');
    const biaId = await arrive('bia');
    const { id } = (await invite('ana', biaId)).json();

    expect((await call('bia', 'POST', `/conversations/${id}/decline`)).json().status).toBe('declined');
    expect((await call('ana', 'GET', '/conversations')).json().conversations).toEqual([]);
    expect((await invite('ana', biaId)).statusCode).toBe(409);
  });

  it('esconde a conversa de quem não participa dela', async () => {
    await arrive('ana');
    const biaId = await arrive('bia');
    const { id } = (await invite('ana', biaId)).json();
    await call('bia', 'POST', `/conversations/${id}/accept`);

    expect((await call('bia', 'GET', `/conversations/${id}`)).json()).toMatchObject({ status: 'accepted' });
    expect((await call('caio', 'GET', `/conversations/${id}`)).statusCode).toBe(404);
    expect((await call('caio', 'GET', `/conversations/${id}/messages`)).statusCode).toBe(404);
    expect((await call('caio', 'POST', `/conversations/${id}/messages`, { text: 'Oi' })).statusCode).toBe(404);
    expect((await call('caio', 'POST', `/conversations/${id}/accept`)).statusCode).toBe(404);
    expect((await call('caio', 'GET', '/conversations/nao-e-id/messages')).statusCode).toBe(404);
  });

  it('valida mensagens vazias ou longas demais', async () => {
    await arrive('ana');
    const biaId = await arrive('bia');
    const { id } = (await invite('ana', biaId)).json();
    await call('bia', 'POST', `/conversations/${id}/accept`);

    expect((await call('ana', 'POST', `/conversations/${id}/messages`, { text: '   ' })).statusCode).toBe(400);
    expect((await call('ana', 'POST', `/conversations/${id}/messages`, { text: 'x'.repeat(1001) })).statusCode).toBe(
      400,
    );
  });

  /** Ana e Bia no bar, com conversa aceita; devolve o id da conversa e o da Bia. */
  async function friends() {
    await arrive('ana');
    const biaId = await arrive('bia');
    const id = (await invite('ana', biaId)).json().id;
    await call('bia', 'POST', `/conversations/${id}/accept`);
    return { id, biaId };
  }

  it('lista contatos só com conversas aceitas', async () => {
    const { id, biaId } = await friends();
    const caioId = await arrive('caio');
    await invite('ana', caioId);

    const res = await call('ana', 'GET', '/me/contacts');
    expect(res.json().contacts).toEqual([{ conversationId: id, user: expect.objectContaining({ id: biaId, displayName: 'bia' }) }]);
  });

  it('recomenda um lugar para um contato, como mensagem com o cartão do lugar', async () => {
    const { id, biaId } = await friends();
    events.length = 0;

    // Recomendar não exige estar no lugar.
    const res = await call('ana', 'POST', `/places/${otherBarId}/recommendations`, { userIds: [biaId], note: 'Vai lá!' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ sent: 1 });

    const messages = (await call('bia', 'GET', `/conversations/${id}/messages`)).json().messages;
    expect(messages.at(-1)).toMatchObject({ text: 'Vai lá!', place: { id: otherBarId, name: 'Outro bar' } });
    expect(events.filter((e) => e.event === 'message:new').map((e) => e.uid).sort()).toEqual(['ana', 'bia']);

    const noNote = await call('ana', 'POST', `/places/${otherBarId}/recommendations`, { userIds: [biaId] });
    expect(noNote.json()).toEqual({ sent: 1 });
    const conversation = (await call('bia', 'GET', `/conversations/${id}`)).json();
    expect(conversation.lastMessage.text).toBe('Recomendo Outro bar');
  });

  it('recusa recomendar para quem não é contato e para lugar que não existe', async () => {
    const { biaId } = await friends();
    const caioId = await arrive('caio');
    await invite('ana', caioId);

    const pending = await call('ana', 'POST', `/places/${barId}/recommendations`, { userIds: [biaId, caioId] });
    expect(pending.statusCode).toBe(422);
    expect(await MessageModel.countDocuments({ place: { $exists: true } })).toBe(0);

    const missing = await call('ana', 'POST', '/places/64b000000000000000000000/recommendations', { userIds: [biaId] });
    expect(missing.statusCode).toBe(404);
    expect((await call('ana', 'POST', `/places/${barId}/recommendations`, { userIds: [] })).statusCode).toBe(400);
  });
});
