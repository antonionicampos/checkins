import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_URL } from './api';
import { auth } from './firebase';

let socket: Socket | null = null;

/** Uma conexão de Socket.IO para o app todo, aberta no primeiro uso; o token é renovado a cada reconexão. */
function getSocket(): Socket {
  if (!socket) {
    const s = io(API_URL, {
      transports: ['websocket'],
      auth: (cb) => {
        auth.currentUser
          ?.getIdToken()
          .then((token) => cb({ token }))
          .catch(() => cb({}));
        if (!auth.currentUser) cb({});
      },
    });
    // Se a API recusar a conexão (token ainda não pronto, API reiniciando), o Socket.IO não tenta de novo
    // sozinho: sem isso, a pessoa ficaria sem receber mensagens até fechar o app.
    s.on('connect_error', () => {
      if (!s.active) setTimeout(() => socket === s && s.connect(), 3000);
    });
    socket = s;
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

/**
 * Chama `handler` sempre que a conexão em tempo real (re)abre. Eventos que chegaram enquanto o celular
 * estava sem conexão se perdem, então a tela usa isto para recarregar o que perdeu.
 */
export function useRealtimeReconnect(handler: () => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const s = getSocket();
    const listener = () => ref.current();
    s.on('connect', listener);
    return () => {
      s.off('connect', listener);
    };
  }, []);
}
