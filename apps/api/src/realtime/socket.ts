import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { Config } from '../config.js';

/**
 * Socket.IO para o chat em tempo real. Cada lugar e cada grupo vira uma "sala".
 * Por enquanto só existe a entrada/saída de salas; mensagens e autenticação vêm
 * junto com as funcionalidades de conversa e login.
 */
export function attachRealtime(httpServer: HttpServer, config: Pick<Config, 'CORS_ORIGIN'>): Server {
  const io = new Server(httpServer, {
    cors: { origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(',') },
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
