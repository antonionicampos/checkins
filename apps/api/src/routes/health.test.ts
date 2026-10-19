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

  it('usa o IP do X-Forwarded-For quando a requisição vem da própria máquina (Cloudflare Tunnel)', async () => {
    const proxied = await buildTestApp();
    let ip: string | undefined;
    proxied.addHook('onRequest', async (req) => {
      ip = req.ip;
    });
    await proxied.inject({ method: 'GET', url: '/health', headers: { 'x-forwarded-for': '203.0.113.7' } });
    await proxied.close();
    expect(ip).toBe('203.0.113.7');
  });
});
