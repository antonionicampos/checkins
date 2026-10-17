import {
  createGroupSchema,
  distanceInMeters,
  GROUP_EVENTS,
  messagesQuerySchema,
  PRESENCE_RADIUS_METERS,
  sendGroupMessageSchema,
  type CheckinAuthor,
  type Group,
  type GroupDetail,
  type GroupMessage,
} from '@checkins/shared';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { isValidObjectId, type Types } from 'mongoose';
import { z } from 'zod';
import { CheckinModel, toAuthorDto } from '../models/checkin.js';
import { activeGroupFilter, GroupMessageModel, GroupModel, type GroupDoc, type GroupMessageDoc } from '../models/group.js';
import { PlaceModel, toPlaceDto } from '../models/place.js';
import { assertMessageRate } from '../moderation/rate-limit.js';
import { blockedEitherWay, findOrCreateUser, UserModel, type UserDoc } from '../models/user.js';

const placeParamsSchema = z.object({ placeId: z.string() });
const groupParamsSchema = z.object({ groupId: z.string() });
const memberParamsSchema = z.object({ groupId: z.string(), userId: z.string() });

const unknownAuthor: CheckinAuthor = { id: '', displayName: 'Conta removida' };
const sameId = (a: unknown, b: unknown) => String(a) === String(b);

async function authorsById(ids: Types.ObjectId[]): Promise<Map<string, CheckinAuthor>> {
  const users = await UserModel.find({ _id: { $in: ids } });
  return new Map(users.map((u) => [u.id as string, toAuthorDto(u)]));
}

async function toGroupDto(doc: GroupDoc, me: UserDoc): Promise<Group> {
  const [admin, place] = await Promise.all([UserModel.findById(doc.adminId), PlaceModel.findById(doc.placeId)]);
  return {
    id: doc.id as string,
    place: { id: String(doc.placeId), name: place?.name ?? 'Lugar removido' },
    name: doc.name,
    description: doc.description ?? undefined,
    admin: admin ? toAuthorDto(admin) : unknownAuthor,
    memberCount: doc.memberIds.length,
    expiresAt: doc.expiresAt?.toISOString(),
    isMember: doc.memberIds.some((m) => sameId(m, me._id)),
    isAdmin: sameId(doc.adminId, me._id),
    createdAt: doc.createdAt.toISOString(),
  };
}

function toGroupMessageDto(doc: GroupMessageDoc, sender: CheckinAuthor): GroupMessage {
  return {
    id: doc.id as string,
    groupId: String(doc.groupId),
    sender,
    text: doc.text,
    createdAt: doc.createdAt.toISOString(),
  };
}

export const groupRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  /** Manda um evento para todos os membros (e, opcionalmente, para quem acabou de sair). */
  async function notifyMembers(doc: GroupDoc, event: string, payload: unknown, extraIds: Types.ObjectId[] = []) {
    const users = await UserModel.find({ _id: { $in: [...doc.memberIds, ...extraIds] } });
    for (const u of users) app.notify(u.firebaseUid, event, payload);
  }

  async function findActiveOr404(groupId: string, reply: FastifyReply) {
    const doc = isValidObjectId(groupId) ? await GroupModel.findOne({ _id: groupId, ...activeGroupFilter() }) : null;
    if (!doc) void reply.code(404).send({ error: 'Grupo não encontrado ou já encerrado' });
    return doc;
  }

  /** Cria um grupo no lugar. Só quem está a até PRESENCE_RADIUS_METERS dele. */
  app.post('/places/:placeId/groups', async (req, reply) => {
    const { placeId } = placeParamsSchema.parse(req.params);
    const input = createGroupSchema.parse(req.body);
    const place = isValidObjectId(placeId) ? await PlaceModel.findById(placeId) : null;
    if (!place) return reply.code(404).send({ error: 'Lugar não encontrado' });

    const distance = distanceInMeters(input.position, toPlaceDto(place).location);
    if (distance > PRESENCE_RADIUS_METERS) {
      return reply.code(422).send({
        error: `Você precisa estar a até ${PRESENCE_RADIUS_METERS} m de ${place.name} para criar um grupo (está a ${Math.round(distance)} m).`,
      });
    }

    const me = await findOrCreateUser(req.identity!);
    const doc = await GroupModel.create({
      placeId: place._id,
      name: input.name,
      description: input.description || undefined,
      adminId: me._id,
      memberIds: [me._id],
      expiresAt: input.durationHours ? new Date(Date.now() + input.durationHours * 3_600_000) : undefined,
    });
    return reply.code(201).send(await toGroupDto(doc, me));
  });

  /** Grupos ativos do lugar, dos mais novos para os mais antigos. Qualquer pessoa vê; entrar exige estar lá. */
  app.get('/places/:placeId/groups', async (req) => {
    const { placeId } = placeParamsSchema.parse(req.params);
    const me = await findOrCreateUser(req.identity!);
    const docs = isValidObjectId(placeId)
      ? await GroupModel.find({ placeId, ...activeGroupFilter() }).sort({ createdAt: -1 }).limit(50)
      : [];
    return { groups: await Promise.all(docs.map((d) => toGroupDto(d, me))) };
  });

  /** Grupos ativos de que eu participo. */
  app.get('/me/groups', async (req) => {
    const me = await findOrCreateUser(req.identity!);
    const docs = await GroupModel.find({ memberIds: me._id, ...activeGroupFilter() }).sort({ updatedAt: -1 });
    return { groups: await Promise.all(docs.map((d) => toGroupDto(d, me))) };
  });

  app.get('/groups/:groupId', async (req, reply) => {
    const { groupId } = groupParamsSchema.parse(req.params);
    const me = await findOrCreateUser(req.identity!);
    const doc = await findActiveOr404(groupId, reply);
    if (!doc) return reply;
    const authors = await authorsById(doc.memberIds);
    const body: GroupDetail = {
      ...(await toGroupDto(doc, me)),
      members: doc.memberIds.map((id) => authors.get(String(id)) ?? unknownAuthor),
      viewerId: me.id as string,
    };
    return body;
  });

  /** Entra no grupo: precisa ter check-in ativo no lugar do grupo. */
  app.post('/groups/:groupId/join', async (req, reply) => {
    const { groupId } = groupParamsSchema.parse(req.params);
    const me = await findOrCreateUser(req.identity!);
    const doc = await findActiveOr404(groupId, reply);
    if (!doc) return reply;
    if (doc.bannedIds.some((b) => sameId(b, me._id))) {
      return reply.code(403).send({ error: 'Você foi removido deste grupo' });
    }
    if (!doc.memberIds.some((m) => sameId(m, me._id))) {
      const present = await CheckinModel.exists({
        userId: me._id,
        placeId: doc.placeId,
        presenceUntil: { $gt: new Date() },
      });
      if (!present) return reply.code(422).send({ error: 'Faça check-in no lugar para entrar no grupo' });
      doc.memberIds.push(me._id);
      await doc.save();
      await notifyMembers(doc, GROUP_EVENTS.updated, { groupId: doc.id });
    }
    return toGroupDto(doc, me);
  });

  /** Sai do grupo. O administrador não sai: encerra o grupo. */
  app.post('/groups/:groupId/leave', async (req, reply) => {
    const { groupId } = groupParamsSchema.parse(req.params);
    const me = await findOrCreateUser(req.identity!);
    const doc = await findActiveOr404(groupId, reply);
    if (!doc) return reply;
    if (sameId(doc.adminId, me._id)) {
      return reply.code(403).send({ error: 'Quem administra não sai do grupo; encerre o grupo se quiser' });
    }
    doc.memberIds = doc.memberIds.filter((m) => !sameId(m, me._id));
    await doc.save();
    await notifyMembers(doc, GROUP_EVENTS.updated, { groupId: doc.id }, [me._id]);
    return reply.code(204).send();
  });

  /** O administrador remove alguém, que não pode voltar. */
  app.delete('/groups/:groupId/members/:userId', async (req, reply) => {
    const { groupId, userId } = memberParamsSchema.parse(req.params);
    const me = await findOrCreateUser(req.identity!);
    const doc = await findActiveOr404(groupId, reply);
    if (!doc) return reply;
    if (!sameId(doc.adminId, me._id)) return reply.code(403).send({ error: 'Só quem administra o grupo remove pessoas' });
    if (sameId(userId, me._id)) return reply.code(400).send({ error: 'Para sair, encerre o grupo' });
    const member = doc.memberIds.find((m) => sameId(m, userId));
    if (!member) return reply.code(404).send({ error: 'Essa pessoa não está no grupo' });
    doc.memberIds = doc.memberIds.filter((m) => !sameId(m, member));
    doc.bannedIds.push(member);
    await doc.save();
    await notifyMembers(doc, GROUP_EVENTS.updated, { groupId: doc.id }, [member]);
    return reply.code(204).send();
  });

  /** O administrador encerra o grupo: ele e as mensagens são apagados. */
  app.delete('/groups/:groupId', async (req, reply) => {
    const { groupId } = groupParamsSchema.parse(req.params);
    const me = await findOrCreateUser(req.identity!);
    const doc = await findActiveOr404(groupId, reply);
    if (!doc) return reply;
    if (!sameId(doc.adminId, me._id)) return reply.code(403).send({ error: 'Só quem administra encerra o grupo' });
    await Promise.all([doc.deleteOne(), GroupMessageModel.deleteMany({ groupId: doc._id })]);
    await notifyMembers(doc, GROUP_EVENTS.updated, { groupId: doc.id, closed: true });
    return reply.code(204).send();
  });

  /** Mensagens do grupo, da mais antiga para a mais nova; só para membros. */
  app.get('/groups/:groupId/messages', async (req, reply) => {
    const { groupId } = groupParamsSchema.parse(req.params);
    const query = messagesQuerySchema.parse(req.query);
    const me = await findOrCreateUser(req.identity!);
    const doc = await findActiveOr404(groupId, reply);
    if (!doc) return reply;
    if (!doc.memberIds.some((m) => sameId(m, me._id))) {
      return reply.code(403).send({ error: 'Entre no grupo para ver as mensagens' });
    }
    // Mensagens de quem está bloqueado não aparecem (o app também filtra as que chegam em tempo real).
    const blocked = [...(await blockedEitherWay(me))];
    const messages = await GroupMessageModel.find({
      groupId: doc._id,
      senderId: { $nin: blocked },
      ...(query.before ? { createdAt: { $lt: new Date(query.before) } } : {}),
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(query.limit);
    const authors = await authorsById(messages.map((m) => m.senderId));
    return {
      messages: messages.reverse().map((m) => toGroupMessageDto(m, authors.get(String(m.senderId)) ?? unknownAuthor)),
    };
  });

  app.post('/groups/:groupId/messages', async (req, reply) => {
    const { groupId } = groupParamsSchema.parse(req.params);
    const { text } = sendGroupMessageSchema.parse(req.body);
    const me = await findOrCreateUser(req.identity!);
    const doc = await findActiveOr404(groupId, reply);
    if (!doc) return reply;
    if (!doc.memberIds.some((m) => sameId(m, me._id))) {
      return reply.code(403).send({ error: 'Entre no grupo para mandar mensagens' });
    }
    await assertMessageRate(me._id);
    const message = await GroupMessageModel.create({
      groupId: doc._id,
      senderId: me._id,
      text,
      expiresAt: doc.expiresAt ?? undefined,
    });
    // Marca o grupo como atualizado, para "meus grupos" mostrar primeiro os com conversa recente.
    await GroupModel.updateOne({ _id: doc._id }, { $currentDate: { updatedAt: true } });
    const dto = toGroupMessageDto(message, toAuthorDto(me));
    await notifyMembers(doc, GROUP_EVENTS.message, dto);
    return reply.code(201).send(dto);
  });
};
