import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, fakeVerifyToken } from '../test/setup.js';
import { attachRealtime } from './socket.js';

describe('Socket.IO', async () => {
  const app = await buildTestApp();
  const io = attachRealtime(app.server, { CORS_ORIGIN: '*' }, fakeVerifyToken);
  let url = '';

  beforeAll(async () => {
    await app.listen({ host: '127.0.0.1', port: 0 });
    url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    io.disconnectSockets(true);
    await app.close();
  });

  function tryConnect(auth: Record<string, string>): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = connect(url, { auth, transports: ['websocket'], reconnection: false });
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', (err) => {
        socket.close();
        reject(err);
      });
    });
  }

  it('recusa conexão sem token', async () => {
    await expect(tryConnect({})).rejects.toThrow('Faça login para continuar');
  });

  it('recusa token inválido', async () => {
    await expect(tryConnect({ token: 'lixo' })).rejects.toThrow('Sessão inválida');
  });

  it('aceita token válido', async () => {
    const socket = await tryConnect({ token: 'test:ana' });
    expect(socket.connected).toBe(true);
    socket.close();
  });
});
