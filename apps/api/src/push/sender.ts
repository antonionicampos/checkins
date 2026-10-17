import type { PushData } from '@checkins/shared';

export interface PushMessage {
  /** Tokens do Expo Push dos aparelhos que recebem. */
  to: string[];
  title: string;
  body: string;
  data: PushData;
}

/** Entrega notificações push. Não espera a entrega nem lança erro: push é melhor esforço. */
export type PushSender = (message: PushMessage) => void;

export const noopPushSender: PushSender = () => {};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** O Expo aceita até 100 mensagens por chamada. */
const CHUNK = 100;

interface Logger {
  warn: (obj: object, msg: string) => void;
}

/**
 * Envia pelo serviço de push do Expo (que repassa para o FCM no Android e para o APNs no iPhone).
 * `onInvalidToken` recebe tokens de aparelhos que desinstalaram o app ou tiraram a permissão.
 */
export function createExpoPushSender(options: {
  accessToken?: string;
  log: Logger;
  onInvalidToken: (token: string) => Promise<void>;
  fetchImpl?: typeof fetch;
}): PushSender {
  const doFetch = options.fetchImpl ?? fetch;

  async function sendChunk(tokens: string[], message: PushMessage) {
    const res = await doFetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(options.accessToken ? { authorization: `Bearer ${options.accessToken}` } : {}),
      },
      body: JSON.stringify(
        tokens.map((to) => ({ to, title: message.title, body: message.body, data: message.data, sound: 'default' })),
      ),
    });
    if (!res.ok) {
      options.log.warn({ status: res.status }, 'o Expo Push recusou o envio');
      return;
    }
    const { data } = (await res.json()) as { data?: Array<{ status: string; details?: { error?: string } }> };
    await Promise.all(
      (data ?? []).map((ticket, i) =>
        ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered'
          ? options.onInvalidToken(tokens[i]!)
          : undefined,
      ),
    );
  }

  return (message) => {
    for (let i = 0; i < message.to.length; i += CHUNK) {
      sendChunk(message.to.slice(i, i + CHUNK), message).catch((err: Error) =>
        options.log.warn({ reason: err.message }, 'falha ao enviar push'),
      );
    }
  };
}
