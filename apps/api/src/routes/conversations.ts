import {
  messagesQuerySchema,
  REALTIME_EVENTS,
  sendMessageSchema,
  startConversationSchema,
  type Conversation,
} from '@checkins/shared';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { isValidObjectId } from 'mongoose';
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
import { findOrCreateUser, UserModel, type UserDoc } from '../models/user.js';

const conversationParamsSchema = z.object({ conversationId: z.string() });

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
    return reply.code(201).send(await toConversationDto(doc, me));
  });

  /** Minhas conversas e convites, das mais recentes para as mais antigas. Recusadas não aparecem. */
  app.get('/conversations', async (req) => {
    const me = await findOrCreateUser(req.identity!);
    const docs = await ConversationModel.find({ participants: me._id, status: { $ne: 'declined' } })
      .sort({ updatedAt: -1 })
      .limit(100);
    return { conversations: await Promise.all(docs.map((d) => toConversationDto(d, me))) };
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

    const message = await MessageModel.create({ conversationId: doc._id, senderId: me._id, text });
    doc.lastMessage = { messageId: message._id, senderId: me._id, text, createdAt: message.createdAt };
    await doc.save();

    const dto = toMessageDto(message);
    const users = await UserModel.find({ _id: { $in: doc.participants } });
    for (const u of users) app.notify(u.firebaseUid, REALTIME_EVENTS.messageNew, dto);
    return reply.code(201).send(dto);
  });
};
