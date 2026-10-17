import { z } from 'zod';
import { checkinAuthorSchema } from './checkins.js';

export const MESSAGE_MAX_LENGTH = 1000;

/**
 * Corpo de POST /conversations: convite para conversar com alguém que está no mesmo lugar.
 * Quem convida e quem é convidado precisam estar presentes no lugar (check-in visível, no caso do convidado).
 */
export const startConversationSchema = z.object({
  userId: z.string(),
  placeId: z.string(),
});
export type StartConversationInput = z.infer<typeof startConversationSchema>;

/** Corpo de POST /conversations/:conversationId/messages. */
export const sendMessageSchema = z.object({
  text: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/** Query de GET /conversations/:conversationId/messages: `before` pagina para mensagens mais antigas. */
export const messagesQuerySchema = z.object({
  before: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const CONVERSATION_STATUSES = ['pending', 'accepted', 'declined'] as const;
export const conversationStatusSchema = z.enum(CONVERSATION_STATUSES);
export type ConversationStatus = z.infer<typeof conversationStatusSchema>;

export const messageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  senderId: z.string(),
  text: z.string(),
  createdAt: z.string(),
});
export type Message = z.infer<typeof messageSchema>;

export const conversationSchema = z.object({
  id: z.string(),
  /** A outra pessoa da conversa. */
  other: checkinAuthorSchema,
  status: conversationStatusSchema,
  /** true se fui eu quem convidou (então quem aceita é a outra pessoa). */
  requestedByMe: z.boolean(),
  /** Onde as duas pessoas se encontraram. */
  place: z.object({ id: z.string(), name: z.string() }),
  lastMessage: messageSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Conversation = z.infer<typeof conversationSchema>;

/** Eventos do Socket.IO que a API manda para cada pessoa da conversa. */
export const REALTIME_EVENTS = {
  conversationUpdated: 'conversation:updated',
  messageNew: 'message:new',
} as const;
