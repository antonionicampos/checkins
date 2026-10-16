import { updateMeSchema } from '@checkins/shared';
import type { FastifyPluginAsync } from 'fastify';
import { findOrCreateUser, toUserDto } from '../models/user.js';

export const meRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  /** Perfil de quem está logado. O app chama logo depois do login, o que cria o perfil. */
  app.get('/me', async (req) => {
    const user = await findOrCreateUser(req.identity!);
    return toUserDto(user);
  });

  app.patch('/me', async (req) => {
    const input = updateMeSchema.parse(req.body);
    const user = await findOrCreateUser(req.identity!);
    user.displayName = input.displayName;
    await user.save();
    return toUserDto(user);
  });
};
