import {
  messagesQuerySchema,
  REALTIME_EVENTS,
  recommendPlaceSchema,
  sendMessageSchema,
  startConversationSchema,
  type Contact,
  type Conversation,
} from '@checkins/shared';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { isValidObjectId, Types } from 'mongoose';
import { z } from 'zod';
import { CheckinModel, toAuthorDto } from '../models/checkin.js';
import {
  ConversationModel,
  MessageModel,
  pairKeyOf,
  toMessageDto,
  type ConversationDoc,
} from '../models/conversation.js';
import { PlaceModel } from '../models/place.js';
import { assertMessageRate } from '../moderation/rate-limit.js';
import { blockedEitherWay, findOrCreateUser, UserModel, type UserDoc } from '../models/user.js';

const conversationParamsSchema = z.object({ conversationId: z.string() });
const placeParamsSchema = z.object({ placeId: z.string() });

/** Monta a conversa do ponto de vista de `me`. */
async function toConversationDto(doc: ConversationDoc, me: UserDoc): Promise<Conversation> {
  const otherId = doc.participants.find((p) => String(p) !== String(me._id));
  const [other, place] = await Promise.all([UserModel.findById(otherId), PlaceModel.findById(doc.placeId)]);
  const last = doc.lastMessage;
  return {
    id: doc.id as string,
    other: other ? toAuthorDto(other) : { id: '', displayName: 'Conta removida' },
    status: doc.status,
    requestedByMe: String(doc.requestedBy) === String(me._id),
    place: { id: String(doc.placeId), name: place?.name ?? 'Lugar removido' },
    lastMessage: last
      ? {
          id: String(last.messageId),
          conversationId: doc.id as string,
          senderId: String(last.senderId),
          text: last.text,
          createdAt: last.createdAt.toISOString(),
        }
      : undefined,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export const conversationRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  /** Avisa as duas pessoas que a conversa mudou, cada uma com a sua visão dela. */
  async function notifyUpdated(doc: ConversationDoc) {
    const users = await UserModel.find({ _id: { $in: doc.participants } });
    await Promise.all(
      users.map(async (u) => app.notify(u.firebaseUid, REALTIME_EVENTS.conversationUpdated, await toConversationDto(doc, u))),
    );
  }

  /** Grava a mensagem, atualiza a última mensagem da conversa e avisa as duas pessoas. */
  async function postMessage(doc: ConversationDoc, me: UserDoc, text: string, place?: { id: Types.ObjectId; name: string }) {
    const message = await MessageModel.create({ conversationId: doc._id, senderId: me._id, text, place });
    doc.lastMessage = { messageId: message._id, senderId: me._id, text, createdAt: message.createdAt };
    await doc.save();

    const dto = toMessageDto(message);
    const users = await UserModel.find({ _id: { $in: doc.participants } });
    for (const u of users) app.notify(u.firebaseUid, REALTIME_EVENTS.messageNew, dto);
    await app.pushTo(
      doc.participants.filter((p) => String(p) !== String(me._id)),
      {
        title: me.displayName,
        // Recomendação sem recado já tem o texto "Recomendo <lugar>"; com recado, mostra o lugar e o recado.
        body: place && text !== `Recomendo ${place.name}` ? `Recomendou ${place.name}: ${text}` : text,
        data: { url: `/conversations/${doc.id as string}` },
      },
    );
    return dto;
  }

  /** A conversa, se `me` faz parte dela; senão responde 404. */
  async function findMineOr404(conversationId: string, me: UserDoc, reply: FastifyReply) {
    const doc = isValidObjectId(conversationId)
      ? await ConversationModel.findOne({ _id: conversationId, participants: me._id })
      : null;
    if (!doc) void reply.code(404).send({ error: 'Conversa não encontrada' });
    return doc;
  }

  /** Convida para conversar alguém que está no mesmo lugar agora. */
  app.post('/conversations', async (req, reply) => {
    const input = startConversationSchema.parse(req.body);
    const me = await findOrCreateUser(req.identity!);
    if (input.userId === String(me._id)) {
      return reply.code(400).send({ error: 'Você não pode conversar com você mesmo' });
    }
    if (!isValidObjectId(input.userId) || !isValidObjectId(input.placeId)) {
      return reply.code(404).send({ error: 'Pessoa ou lugar não encontrado' });
    }

    if ((await blockedEitherWay(me)).has(input.userId)) {
      return reply.code(403).send({ error: 'Não é possível conversar com essa pessoa' });
    }

    const now = new Date();
    const [myPresence, theirPresence] = await Promise.all([
      CheckinModel.exists({ userId: me._id, placeId: input.placeId, presenceUntil: { $gt: now } }),
      CheckinModel.exists({ userId: input.userId, placeId: input.placeId, presenceUntil: { $gt: now }, visible: true }),
    ]);
    if (!myPresence) {
      return reply.code(422).send({ error: 'Faça check-in no lugar para puxar conversa com quem está lá' });
    }
    if (!theirPresence) {
      return reply.code(422).send({ error: 'Essa pessoa não está mais no lugar' });
    }

    const pairKey = pairKeyOf(me._id, input.userId);
    const existing = await ConversationModel.findOne({ pairKey });
    if (existing) {
      if (existing.status === 'declined') {
        return reply.code(409).send({ error: 'Essa pessoa não aceitou o convite' });
      }
      return reply.code(200).send(await toConversationDto(existing, me));
    }

    const doc = await ConversationModel.create({
      participants: [me._id, input.userId].sort((a, b) => String(a).localeCompare(String(b))),
      pairKey,
      requestedBy: me._id,
      placeId: input.placeId,
    });
    await notifyUpdated(doc);
    const place = await PlaceModel.findById(input.placeId, { name: 1 });
    await app.pushTo([new Types.ObjectId(input.userId)], {
      title: 'Convite para conversar',
      body: `${me.displayName} quer conversar com você${place ? ` em ${place.name}` : ''}`,
      data: { url: '/conversations' },
    });
    return reply.code(201).send(await toConversationDto(doc, me));
  });

  /** Minhas conversas e convites, das mais recentes para as mais antigas. Recusadas não aparecem. */
  app.get('/conversations', async (req) => {
    const me = await findOrCreateUser(req.identity!);
    const blocked = await blockedEitherWay(me);
    const docs = await ConversationModel.find({ participants: me._id, status: { $ne: 'declined' } })
      .sort({ updatedAt: -1 })
      .limit(100);
    // Conversas com quem está bloqueado (por mim ou por ela) somem da lista.
    const visible = docs.filter((d) => !d.participants.some((p) => blocked.has(String(p))));
    return { conversations: await Promise.all(visible.map((d) => toConversationDto(d, me))) };
  });

  app.get('/conversations/:conversationId', async (req, reply) => {
    const { conversationId } = conversationParamsSchema.parse(req.params);
    const me = await findOrCreateUser(req.identity!);
    const doc = await findMineOr404(conversationId, me, reply);
    if (!doc) return reply;
    return toConversationDto(doc, me);
  });

  /** Aceita ou recusa um convite recebido. */
  for (const action of ['accept', 'decline'] as const) {
    app.post(`/conversations/:conversationId/${action}`, async (req, reply) => {
      const { conversationId } = conversationParamsSchema.parse(req.params);
      const me = await findOrCreateUser(req.identity!);
      const doc = await findMineOr404(conversationId, me, reply);
      if (!doc) return reply;
      if (String(doc.requestedBy) === String(me._id)) {
        return reply.code(403).send({ error: 'Só quem recebeu o convite pode responder' });
      }
      if (doc.status !== 'pending') {
        return reply.code(409).send({ error: 'Esse convite já foi respondido' });
      }
      doc.status = action === 'accept' ? 'accepted' : 'declined';
      await doc.save();
      await notifyUpdated(doc);
      // Recusa não avisa ninguém; aceite avisa quem convidou.
      if (action === 'accept') {
        await app.pushTo([doc.requestedBy], {
          title: 'Convite aceito',
          body: `${me.displayName} aceitou conversar com você`,
          data: { url: `/conversations/${doc.id as string}` },
        });
      }
      return toConversationDto(doc, me);
    });
  }

  /** Mensagens da conversa, da mais antiga para a mais nova; `before` busca as anteriores. */
  app.get('/conversations/:conversationId/messages', async (req, reply) => {
    const { conversationId } = conversationParamsSchema.parse(req.params);
    const query = messagesQuerySchema.parse(req.query);
    const me = await findOrCreateUser(req.identity!);
    const doc = await findMineOr404(conversationId, me, reply);
    if (!doc) return reply;

    const messages = await MessageModel.find({
      conversationId: doc._id,
      ...(query.before ? { createdAt: { $lt: new Date(query.before) } } : {}),
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(query.limit);
    return { messages: messages.reverse().map(toMessageDto) };
  });

  /** Manda uma mensagem; só depois que o convite foi aceito. */
  app.post('/conversations/:conversationId/messages', async (req, reply) => {
    const { conversationId } = conversationParamsSchema.parse(req.params);
    const { text } = sendMessageSchema.parse(req.body);
    const me = await findOrCreateUser(req.identity!);
    const doc = await findMineOr404(conversationId, me, reply);
    if (!doc) return reply;
    if (doc.status !== 'accepted') {
      return reply.code(403).send({ error: 'A conversa começa quando a outra pessoa aceitar o convite' });
    }
    const blocked = await blockedEitherWay(me);
    if (doc.participants.some((p) => blocked.has(String(p)))) {
      return reply.code(403).send({ error: 'Não é possível conversar com essa pessoa' });
    }
    await assertMessageRate(me._id);

    const dto = await postMessage(doc, me, text);
    return reply.code(201).send(dto);
  });

  /** Contatos: pessoas com quem tenho conversa aceita, das conversas mais recentes para as mais antigas. */
  app.get('/me/contacts', async (req) => {
    const me = await findOrCreateUser(req.identity!);
    const blocked = await blockedEitherWay(me);
    const accepted = await ConversationModel.find({ participants: me._id, status: 'accepted' }).sort({ updatedAt: -1 }).limit(200);
    const docs = accepted.filter((d) => !d.participants.some((p) => blocked.has(String(p))));
    const otherIds = docs.map((d) => d.participants.find((p) => String(p) !== String(me._id)));
    const users = await UserModel.find({ _id: { $in: otherIds } });
    const byId = new Map(users.map((u) => [u.id as string, toAuthorDto(u)]));
    const contacts: Contact[] = [];
    docs.forEach((d, i) => {
      const user = byId.get(String(otherIds[i]));
      if (user) contacts.push({ user, conversationId: d.id as string });
    });
    return { contacts };
  });

  /**
   * Recomenda um lugar para contatos: vira uma mensagem na conversa com cada um, com o cartão do lugar.
   * Não exige estar no lugar. Se algum destinatário não for contato, nada é enviado.
   */
  app.post('/places/:placeId/recommendations', async (req, reply) => {
    const { placeId } = placeParamsSchema.parse(req.params);
    const input = recommendPlaceSchema.parse(req.body);
    const place = isValidObjectId(placeId) ? await PlaceModel.findById(placeId) : null;
    if (!place) return reply.code(404).send({ error: 'Lugar não encontrado' });

    const me = await findOrCreateUser(req.identity!);
    const userIds = [...new Set(input.userIds)];
    const pairKeys = userIds.filter(isValidObjectId).map((id) => pairKeyOf(me._id, id));
    const blocked = await blockedEitherWay(me);
    const found = await ConversationModel.find({ pairKey: { $in: pairKeys }, status: 'accepted' });
    const docs = found.filter((d) => !d.participants.some((p) => blocked.has(String(p))));
    if (docs.length !== userIds.length) {
      return reply.code(422).send({ error: 'Só dá para recomendar para quem já conversa com você' });
    }

    await assertMessageRate(me._id, docs.length);
    const text = input.note || `Recomendo ${place.name}`;
    await Promise.all(docs.map((d) => postMessage(d, me, text, { id: place._id, name: place.name })));
    return { sent: docs.length };
  });
};
