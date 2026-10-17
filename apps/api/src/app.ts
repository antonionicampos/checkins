import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { registerAuth } from './auth/plugin.js';
import type { VerifyToken } from './auth/identity.js';
import type { Config } from './config.js';
import { createPushToUsers, type PushToUsers } from './push/notify.js';
import { noopPushSender, type PushSender } from './push/sender.js';
import { noopNotify, type Notify } from './realtime/notify.js';
import { checkinRoutes } from './routes/checkins.js';
import { conversationRoutes } from './routes/conversations.js';
import { groupRoutes } from './routes/groups.js';
import { mediaRoutes } from './routes/media.js';
import { menuRoutes } from './routes/menus.js';
import { photoRoutes } from './routes/photos.js';
import { userRoutes } from './routes/users.js';
import { healthRoutes } from './routes/health.js';
import { meRoutes } from './routes/me.js';
import { moderationRoutes } from './routes/moderation.js';
import { placeRoutes } from './routes/places.js';

export interface AppDeps {
  /** Validação do token de login; nos testes, troca-se por uma falsa. */
  verifyToken: VerifyToken;
  /** Envio de eventos em tempo real; o servidor liga no Socket.IO depois de criá-lo. */
  notify?: Notify;
  /** Envio de notificações push; o servidor usa o Expo Push, os testes guardam o que seria enviado. */
  push?: PushSender;
}

declare module 'fastify' {
  interface FastifyInstance {
    notify: Notify;
    pushTo: PushToUsers;
  }
}

/** Monta a API sem abrir porta nem conectar no banco, para os testes usarem `app.inject`. */
export async function buildApp(
  config: Pick<Config, 'CORS_ORIGIN' | 'LOG_LEVEL' | 'MEDIA_DIR'>,
  deps: AppDeps,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: config.LOG_LEVEL } });
  registerAuth(app, deps.verifyToken);
  app.decorate('notify', deps.notify ?? noopNotify);
  app.decorate('pushTo', createPushToUsers(deps.push ?? noopPushSender));

  await app.register(cors, {
    origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(',').map((o) => o.trim()),
  });

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'Dados inválidos', issues: error.issues });
    }
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    if (statusCode >= 500) app.log.error(error);
    return reply
      .code(statusCode)
      .send({ error: statusCode >= 500 ? 'Erro interno' : (error as Error).message });
  });

  await app.register(healthRoutes);
  await app.register(placeRoutes);
  await app.register(meRoutes);
  await app.register(checkinRoutes);
  await app.register(conversationRoutes);
  await app.register(groupRoutes);
  await app.register(mediaRoutes(config.MEDIA_DIR));
  await app.register(menuRoutes(config.MEDIA_DIR));
  await app.register(photoRoutes(config.MEDIA_DIR));
  await app.register(userRoutes);
  await app.register(moderationRoutes);

  return app;
}
