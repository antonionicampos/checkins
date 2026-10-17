import { createReportSchema, type BlocksResponse } from '@checkins/shared';
import type { FastifyPluginAsync } from 'fastify';
import { isValidObjectId } from 'mongoose';
import { z } from 'zod';
import { findReportTarget } from '../moderation/targets.js';
import { toAuthorDto } from '../models/checkin.js';
import { ReportModel } from '../models/report.js';
import { findOrCreateUser, UserModel } from '../models/user.js';

const userParamsSchema = z.object({ userId: z.string() });

export const moderationRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  /** Denuncia uma pessoa ou um conteúdo. Denunciar de novo o mesmo conteúdo não duplica. */
  app.post('/reports', async (req, reply) => {
    const input = createReportSchema.parse(req.body);
    const me = await findOrCreateUser(req.identity!);
    const target = await findReportTarget(input.targetType, input.targetId, me._id);
    if (!target) return reply.code(404).send({ error: 'Não encontramos o que você quer denunciar' });
    if (target.userId && String(target.userId) === String(me._id)) {
      return reply.code(400).send({ error: 'Você não pode denunciar algo seu' });
    }
    await ReportModel.updateOne(
      { reporterId: me._id, targetType: input.targetType, targetId: input.targetId },
      {
        $setOnInsert: { targetUserId: target.userId, snapshot: target.snapshot.slice(0, 300) },
        $set: { reason: input.reason, details: input.details, status: 'open' },
      },
      { upsert: true },
    );
    req.log.warn({ targetType: input.targetType, targetId: input.targetId, reason: input.reason }, 'nova denúncia');
    return reply.code(201).send({ ok: true });
  });

  /** Pessoas que eu bloqueei. */
  app.get('/me/blocks', async (req) => {
    const me = await findOrCreateUser(req.identity!);
    const users = await UserModel.find({ _id: { $in: me.blockedIds } });
    const body: BlocksResponse = { users: users.map(toAuthorDto) };
    return body;
  });

  app.post('/users/:userId/block', async (req, reply) => {
    const { userId } = userParamsSchema.parse(req.params);
    const me = await findOrCreateUser(req.identity!);
    if (userId === String(me._id)) return reply.code(400).send({ error: 'Você não pode se bloquear' });
    if (!isValidObjectId(userId) || !(await UserModel.exists({ _id: userId }))) {
      return reply.code(404).send({ error: 'Pessoa não encontrada' });
    }
    await UserModel.updateOne({ _id: me._id }, { $addToSet: { blockedIds: userId } });
    return reply.code(204).send();
  });

  app.delete('/users/:userId/block', async (req, reply) => {
    const { userId } = userParamsSchema.parse(req.params);
    const me = await findOrCreateUser(req.identity!);
    if (isValidObjectId(userId)) await UserModel.updateOne({ _id: me._id }, { $pull: { blockedIds: userId } });
    return reply.code(204).send();
  });
};
