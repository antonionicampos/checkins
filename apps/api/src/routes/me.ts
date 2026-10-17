import { pushTokenSchema, updateMeSchema } from '@checkins/shared';
import type { FastifyPluginAsync } from 'fastify';
import { findOrCreateUser, toUserDto, UserModel } from '../models/user.js';

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
    if (input.displayName !== undefined) user.displayName = input.displayName;
    if (input.bio !== undefined) user.bio = input.bio || undefined;
    await user.save();
    return toUserDto(user);
  });

  /** Registra o aparelho para receber push. Se o aparelho era de outra conta, passa para esta. */
  app.post('/me/push-tokens', async (req, reply) => {
    const { token } = pushTokenSchema.parse(req.body);
    const user = await findOrCreateUser(req.identity!);
    await UserModel.updateMany({ pushTokens: token, _id: { $ne: user._id } }, { $pull: { pushTokens: token } });
    await UserModel.updateOne({ _id: user._id }, { $addToSet: { pushTokens: token } });
    return reply.code(204).send();
  });

  /** Ao sair da conta, o app tira o aparelho para não receber push de quem saiu. */
  app.delete('/me/push-tokens', async (req, reply) => {
    const { token } = pushTokenSchema.parse(req.body);
    const user = await findOrCreateUser(req.identity!);
    await UserModel.updateOne({ _id: user._id }, { $pull: { pushTokens: token } });
    return reply.code(204).send();
  });
};
