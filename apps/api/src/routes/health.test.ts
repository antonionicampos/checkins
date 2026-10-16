import { afterAll, describe, expect, it } from 'vitest';
import { buildTestApp } from '../test/setup.js';

describe('GET /health', async () => {
  const app = await buildTestApp();
  afterAll(() => app.close());

  it('responde 503 "degraded" quando o MongoDB não está conectado', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: 'degraded', services: { mongo: 'down' } });
  });
});
