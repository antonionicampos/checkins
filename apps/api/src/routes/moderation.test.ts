import { MESSAGE_RATE_LIMIT, toGeoPoint } from '@checkins/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectMongo, disconnectMongo } from '../db.js';
import { banUser, dismissCase, listOpenCases, removeCase, unbanUser } from '../moderation/review.js';
import { CheckinModel } from '../models/checkin.js';
import { ConversationModel, MessageModel } from '../models/conversation.js';
import { GroupMessageModel, GroupModel } from '../models/group.js';
import { PhotoModel } from '../models/photo.js';
import { PlaceModel } from '../models/place.js';
import { ReportModel } from '../models/report.js';
import { UserModel } from '../models/user.js';
import { authHeader, buildTestApp, TEST_MEDIA_DIR, TEST_MONGO_URL } from '../test/setup.js';

const barPos = { lat: -23.5614, lng: -46.6559 };
const near = { lat: barPos.lat + 0.0003, lng: barPos.lng };
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 1)]);

const models = [PlaceModel, CheckinModel, UserModel, ConversationModel, MessageModel, GroupModel, GroupMessageModel, PhotoModel, ReportModel];

describe.skipIf(!TEST_MONGO_URL)('denúncia, bloqueio e moderação', async () => {
  const app = await buildTestApp();
  let barId = '';

  beforeAll(async () => {
    await connectMongo(TEST_MONGO_URL!);
    await Promise.all(models.map((m) => (m as typeof UserModel).syncIndexes()));
  });

  beforeEach(async () => {
    await Promise.all(models.map((m) => (m as typeof UserModel).deleteMany()));
    barId = (await PlaceModel.create({ name: 'Bar', category: 'bar', location: toGeoPoint(barPos) })).id as string;
  });

  afterAll(async () => {
    await app.close();
    await disconnectMongo();
  });

  const call = (uid: string, method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, headers: authHeader(uid), ...(payload ? { payload } : {}) });

  async function arrive(uid: string, comment?: string): Promise<{ userId: string; checkinId: string }> {
    const res = await call(uid, 'POST', `/places/${barId}/checkins`, { position: near, comment });
    return { userId: res.json().author.id, checkinId: res.json().id };
  }

  /** Ana e Bia no bar, com conversa aceita. */
  async function friends() {
    const ana = await arrive('ana');
    const bia = await arrive('bia');
    const conversationId = (await call('ana', 'POST', '/conversations', { userId: bia.userId, placeId: barId })).json().id;
    await call('bia', 'POST', `/conversations/${conversationId}/accept`);
    return { anaId: ana.userId, biaId: bia.userId, conversationId };
  }

  async function postPhoto(uid: string) {
    const boundary = '----t';
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="f.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
      JPEG,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await app.inject({
      method: 'POST',
      url: `/places/${barId}/photos`,
      headers: { ...authHeader(uid), 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });
    return res.json();
  }

  it('denuncia conteúdo, sem duplicar, e a moderação remove ou descarta', async () => {
    await arrive('ana');
    const photo = await postPhoto('ana');
    const { checkinId } = await arrive('bia', 'Comentário ruim');

    const report = (uid: string, targetType: string, targetId: string) =>
      call(uid, 'POST', '/reports', { targetType, targetId, reason: 'offensive', details: 'Ofensivo' });

    expect((await report('bia', 'photo', photo.id)).statusCode).toBe(201);
    expect((await report('bia', 'photo', photo.id)).statusCode).toBe(201);
    expect((await report('caio', 'photo', photo.id)).statusCode).toBe(201);
    expect((await report('ana', 'photo', photo.id)).statusCode).toBe(400);
    expect((await report('ana', 'checkin', checkinId)).statusCode).toBe(201);
    expect((await report('ana', 'photo', '64b000000000000000000000')).statusCode).toBe(404);
    expect(await ReportModel.countDocuments()).toBe(3);

    const cases = await listOpenCases();
    expect(cases).toHaveLength(2);
    const photoCase = cases.find((c) => c.targetType === 'photo')!;
    expect(photoCase).toMatchObject({ count: 2, targetId: photo.id });
    expect(photoCase.targetUser).toContain('ana');

    await removeCase(photoCase.reportId, TEST_MEDIA_DIR);
    expect(await PhotoModel.exists({ _id: photo.id })).toBeNull();
    const checkinCase = cases.find((c) => c.targetType === 'checkin')!;
    await dismissCase(checkinCase.reportId);
    expect(await listOpenCases()).toEqual([]);
    expect((await CheckinModel.findById(checkinId))?.comment).toBe('Comentário ruim');
  });

  it('só quem está na conversa denuncia uma mensagem dela', async () => {
    const { conversationId } = await friends();
    const message = (await call('ana', 'POST', `/conversations/${conversationId}/messages`, { text: 'oi' })).json();
    const body = { targetType: 'message', targetId: message.id, reason: 'harassment' };
    expect((await call('caio', 'POST', '/reports', body)).statusCode).toBe(404);
    expect((await call('bia', 'POST', '/reports', body)).statusCode).toBe(201);
  });

  it('bloqueio esconde a pessoa e impede a conversa, nos dois sentidos', async () => {
    const { anaId, biaId, conversationId } = await friends();
    await postPhoto('bia');

    expect((await call('ana', 'POST', `/users/${biaId}/block`)).statusCode).toBe(204);
    expect((await call('ana', 'GET', '/me/blocks')).json().users).toEqual([expect.objectContaining({ id: biaId })]);
    expect((await call('ana', 'GET', `/users/${biaId}`)).json().blockedByMe).toBe(true);

    for (const [uid, otherId] of [['ana', biaId], ['bia', anaId]] as const) {
      const presence = (await call(uid, 'GET', `/places/${barId}/presence`)).json();
      expect(presence.people.map((p: { author: { id: string } }) => p.author.id)).not.toContain(otherId);
      expect((await call(uid, 'GET', '/conversations')).json().conversations).toEqual([]);
      expect((await call(uid, 'GET', '/me/contacts')).json().contacts).toEqual([]);
      const sent = await call(uid, 'POST', `/conversations/${conversationId}/messages`, { text: 'oi' });
      expect(sent.statusCode).toBe(403);
    }
    expect((await call('ana', 'GET', `/places/${barId}/photos`)).json().photos).toEqual([]);

    await call('ana', 'DELETE', `/users/${biaId}/block`);
    expect((await call('ana', 'GET', `/places/${barId}/photos`)).json().photos).toHaveLength(1);
    expect((await call('ana', 'GET', '/conversations')).json().conversations).toHaveLength(1);
  });

  it('conta suspensa recebe 403 em tudo até ser reativada', async () => {
    const { userId } = await arrive('ana');
    await banUser(userId, 'teste');
    const res = await call('ana', 'GET', '/me');
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain('suspensa');
    await unbanUser(userId);
    expect((await call('ana', 'GET', '/me')).statusCode).toBe(200);
  });

  it('limita as mensagens por minuto', async () => {
    const { conversationId } = await friends();
    for (let i = 0; i < MESSAGE_RATE_LIMIT.count; i++) {
      expect((await call('ana', 'POST', `/conversations/${conversationId}/messages`, { text: `m${i}` })).statusCode).toBe(201);
    }
    const blocked = await call('ana', 'POST', `/conversations/${conversationId}/messages`, { text: 'mais uma' });
    expect(blocked.statusCode).toBe(429);
    // A outra pessoa continua podendo responder.
    expect((await call('bia', 'POST', `/conversations/${conversationId}/messages`, { text: 'calma' })).statusCode).toBe(201);
  });
});
