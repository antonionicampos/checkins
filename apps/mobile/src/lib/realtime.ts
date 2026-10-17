import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_URL } from './api';
import { auth } from './firebase';

let socket: Socket | null = null;

/** Uma conexão de Socket.IO para o app todo, aberta no primeiro uso; o token é renovado a cada reconexão. */
function getSocket(): Socket {
  if (!socket) {
    socket = io(API_URL, {
      transports: ['websocket'],
      auth: (cb) => {
        void auth.currentUser?.getIdToken().then((token) => cb({ token }));
      },
    });
  }
  return socket;
}

/** Fecha a conexão (ao sair da conta). */
export function closeRealtime() {
  socket?.disconnect();
  socket = null;
}

/** Escuta um evento em tempo real enquanto a tela estiver montada. */
export function useRealtime<T>(event: string, handler: (payload: T) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const s = getSocket();
    const listener = (payload: T) => ref.current(payload);
    s.on(event, listener);
    return () => {
      s.off(event, listener);
    };
  }, [event]);
}
