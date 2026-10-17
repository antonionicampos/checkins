import {
  CHECKIN_PRESENCE_HOURS,
  createCheckinSchema,
  distanceInMeters,
  PRESENCE_RADIUS_METERS,
  type CheckinAuthor,
  type PlaceReviewsResponse,
  type PresenceResponse,
} from '@checkins/shared';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { isValidObjectId, Types } from 'mongoose';
import { z } from 'zod';
import { CheckinModel, toAuthorDto, toCheckinDto, type CheckinDoc } from '../models/checkin.js';
import { PlaceModel, toPlaceDto } from '../models/place.js';
import { blockedEitherWay, findOrCreateUser, UserModel } from '../models/user.js';

const placeParamsSchema = z.object({ placeId: z.string() });

async function findPlaceOr404(placeId: string, reply: FastifyReply) {
  const place = isValidObjectId(placeId) ? await PlaceModel.findById(placeId) : null;
  if (!place) void reply.code(404).send({ error: 'Lugar não encontrado' });
  return place;
}

/** Busca os autores de vários check-ins de uma vez. */
async function authorsOf(checkins: CheckinDoc[]): Promise<Map<string, CheckinAuthor>> {
  const ids = [...new Set(checkins.map((c) => String(c.userId)))];
  const users = await UserModel.find({ _id: { $in: ids } });
  return new Map(users.map((u) => [u.id as string, toAuthorDto(u)]));
}

const unknownAuthor: CheckinAuthor = { id: '', displayName: 'Conta removida' };

export const checkinRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  /** Faz check-in: só vale estando a até PRESENCE_RADIUS_METERS do lugar. */
  app.post('/places/:placeId/checkins', async (req, reply) => {
    const { placeId } = placeParamsSchema.parse(req.params);
    const input = createCheckinSchema.parse(req.body);
    const place = await findPlaceOr404(placeId, reply);
    if (!place) return reply;

    const distance = distanceInMeters(input.position, toPlaceDto(place).location);
    if (distance > PRESENCE_RADIUS_METERS) {
      return reply.code(422).send({
        error: `Você precisa estar a até ${PRESENCE_RADIUS_METERS} m de ${place.name} para fazer check-in (está a ${Math.round(distance)} m).`,
      });
    }

    const user = await findOrCreateUser(req.identity!);
    const now = new Date();
    // Uma presença por vez: um novo check-in encerra o anterior.
    await CheckinModel.updateMany({ userId: user._id, presenceUntil: { $gt: now } }, { presenceUntil: now });
    const checkin = await CheckinModel.create({
      userId: user._id,
      placeId: place._id,
      comment: input.comment || undefined,
      rating: input.rating,
      visible: input.visible,
      presenceUntil: new Date(now.getTime() + CHECKIN_PRESENCE_HOURS * 60 * 60 * 1000),
    });
    return reply.code(201).send(toCheckinDto(checkin, toAuthorDto(user)));
  });

  /** Sai do local: encerra a presença ativa, onde quer que seja. */
  app.delete('/me/presence', async (req, reply) => {
    const user = await findOrCreateUser(req.identity!);
    const now = new Date();
    await CheckinModel.updateMany({ userId: user._id, presenceUntil: { $gt: now } }, { presenceUntil: now });
    return reply.code(204).send();
  });

  /** Quem está no local agora. A lista só aparece para quem também está lá. */
  app.get('/places/:placeId/presence', async (req, reply) => {
    const { placeId } = placeParamsSchema.parse(req.params);
    const place = await findPlaceOr404(placeId, reply);
    if (!place) return reply;

    const user = await findOrCreateUser(req.identity!);
    const now = new Date();
    const active = await CheckinModel.find({ placeId: place._id, presenceUntil: { $gt: now } }).sort({
      createdAt: -1,
    });
    const mine = active.find((c) => String(c.userId) === String(user._id));
    if (!mine) {
      const body: PresenceResponse = { present: false, people: [] };
      return body;
    }

    // Uma linha por pessoa (o check-in mais recente), sem quem pediu, só quem escolheu aparecer e sem bloqueios.
    const seen = new Set<string>([String(user._id), ...(await blockedEitherWay(user))]);
    const others = active.filter((c) => {
      const id = String(c.userId);
      if (seen.has(id) || !c.visible) return false;
      seen.add(id);
      return true;
    });
    const authors = await authorsOf(others);
    const body: PresenceResponse = {
      present: true,
      myCheckin: toCheckinDto(mine, toAuthorDto(user)),
      people: others.map((c) => toCheckinDto(c, authors.get(String(c.userId)) ?? unknownAuthor)),
    };
    return body;
  });

  /** Comentários e notas recentes do lugar, com a média das notas. */
  app.get('/places/:placeId/checkins', async (req, reply) => {
    const { placeId } = placeParamsSchema.parse(req.params);
    const place = await findPlaceOr404(placeId, reply);
    if (!place) return reply;

    const me = await findOrCreateUser(req.identity!);
    const blocked = [...(await blockedEitherWay(me))];
    const [recent, stats] = await Promise.all([
      CheckinModel.find({
        placeId: place._id,
        userId: { $nin: blocked },
        $or: [{ comment: { $exists: true, $ne: '' } }, { rating: { $exists: true } }],
      })
        .sort({ createdAt: -1 })
        .limit(20),
      CheckinModel.aggregate<{ avg: number; count: number }>([
        { $match: { placeId: new Types.ObjectId(String(place._id)), rating: { $exists: true } } },
        { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
      ]),
    ]);
    const authors = await authorsOf(recent);
    const body: PlaceReviewsResponse = {
      averageRating: stats[0] ? Math.round(stats[0].avg * 10) / 10 : undefined,
      ratingCount: stats[0]?.count ?? 0,
      recent: recent.map((c) => toCheckinDto(c, authors.get(String(c.userId)) ?? unknownAuthor)),
    };
    return body;
  });
};
