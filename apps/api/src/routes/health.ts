import type { HealthResponse } from '@checkins/shared';
import type { FastifyPluginAsync } from 'fastify';
import { readFileSync } from 'node:fs';
import { isMongoUp } from '../db.js';

// Mesmo caminho relativo em src/routes e dist/routes.
const { version } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string };

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async (_req, reply) => {
    const mongo = isMongoUp() ? 'up' : 'down';
    const body: HealthResponse = {
      status: mongo === 'up' ? 'ok' : 'degraded',
      version,
      services: { mongo },
    };
    return reply.code(mongo === 'up' ? 200 : 503).send(body);
  });
};
