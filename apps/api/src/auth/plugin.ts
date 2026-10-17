import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { bearerToken, UnauthorizedError, type AuthIdentity, type VerifyToken } from './identity.js';

declare module 'fastify' {
  interface FastifyRequest {
    identity: AuthIdentity | null;
  }
  interface FastifyInstance {
    /** preHandler que exige um ID token válido do Firebase em "Authorization: Bearer". */
    requireAuth: preHandlerHookHandler;
  }
}

export function registerAuth(app: FastifyInstance, verifyToken: VerifyToken) {
  app.decorateRequest('identity', null);
  app.decorate('requireAuth', async function requireAuth(req) {
    const token = bearerToken(req.headers.authorization);
    if (!token) throw new UnauthorizedError();
    try {
      req.identity = await verifyToken(token);
    } catch (err) {
      // O motivo (token vencido, projeto errado, relógio fora de hora) fica no log para investigar.
      req.log.info({ reason: (err as Error).message }, 'token recusado');
      throw new UnauthorizedError('Sessão inválida ou expirada; faça login de novo');
    }
  } satisfies preHandlerHookHandler);
}
