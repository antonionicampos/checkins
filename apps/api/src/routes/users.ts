import type { Profile } from '@checkins/shared';
import type { FastifyPluginAsync } from 'fastify';
import { isValidObjectId } from 'mongoose';
import { z } from 'zod';
import { CheckinModel } from '../models/checkin.js';
import { PhotoModel } from '../models/photo.js';
import { findOrCreateUser, UserModel } from '../models/user.js';

const paramsSchema = z.object({ userId: z.string() });

export const userRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  /** Perfil público: nome, foto, "sobre mim" e números de check-ins, lugares e fotos. */
  app.get('/users/:userId', async (req, reply) => {
    const { userId } = paramsSchema.parse(req.params);
    const me = await findOrCreateUser(req.identity!);
    const user = isValidObjectId(userId) ? await UserModel.findById(userId) : null;
    if (!user) return reply.code(404).send({ error: 'Pessoa não encontrada' });

    const [checkinCount, places, photoCount] = await Promise.all([
      CheckinModel.countDocuments({ userId: user._id }),
      CheckinModel.distinct('placeId', { userId: user._id }),
      PhotoModel.countDocuments({ userId: user._id }),
    ]);
    const profile: Profile = {
      id: user.id as string,
      displayName: user.displayName,
      photoUrl: user.photoUrl ?? undefined,
      bio: user.bio || undefined,
      isMe: String(user._id) === String(me._id),
      checkinCount,
      placeCount: places.length,
      photoCount,
      memberSince: user.createdAt.toISOString(),
    };
    return profile;
  });
};
