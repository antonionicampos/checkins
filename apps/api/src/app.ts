import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import type { Config } from './config.js';
import { healthRoutes } from './routes/health.js';
import { placeRoutes } from './routes/places.js';

/** Monta a API sem abrir porta nem conectar no banco, para os testes usarem `app.inject`. */
export async function buildApp(config: Pick<Config, 'CORS_ORIGIN' | 'LOG_LEVEL'>): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: config.LOG_LEVEL } });

  await app.register(cors, {
    origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(',').map((o) => o.trim()),
  });

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'Dados inválidos', issues: error.issues });
    }
    app.log.error(error);
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    return reply
      .code(statusCode)
      .send({ error: statusCode >= 500 ? 'Erro interno' : (error as Error).message });
  });

  await app.register(healthRoutes);
  await app.register(placeRoutes);

  return app;
}
