import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { VerifyToken } from '../auth/identity.js';
import type { Config } from '../config.js';

/**
 * Socket.IO para o chat em tempo real. Cada lugar e cada grupo vira uma "sala".
 * A conexão exige o ID token do Firebase em `auth.token` (io(url, { auth: { token } })).
 * Por enquanto só existe a entrada/saída de salas; mensagens vêm com a conversa.
 */
export function attachRealtime(
  httpServer: HttpServer,
  config: Pick<Config, 'CORS_ORIGIN'>,
  verifyToken: VerifyToken,
): Server {
  const io = new Server(httpServer, {
    cors: { origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(',') },
  });

  io.use((socket, next) => {
    const token: unknown = socket.handshake.auth.token;
    if (typeof token !== 'string') return next(new Error('Faça login para continuar'));
    verifyToken(token)
      .then((identity) => {
        socket.data.identity = identity;
        next();
      })
      .catch(() => next(new Error('Sessão inválida ou expirada')));
  });

  io.on('connection', (socket) => {
    socket.on('place:join', (placeId: unknown) => {
      if (typeof placeId === 'string') void socket.join(`place:${placeId}`);
    });
    socket.on('place:leave', (placeId: unknown) => {
      if (typeof placeId === 'string') void socket.leave(`place:${placeId}`);
    });
  });

  return io;
}
