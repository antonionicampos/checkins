import { z } from 'zod';
import { checkinAuthorSchema } from './checkins.js';
import { MESSAGE_MAX_LENGTH } from './conversations.js';
import { latLngSchema } from './geo.js';

/** Opções de duração para grupos temporários, em horas. Sem duração, o grupo não tem prazo. */
export const GROUP_DURATION_HOURS = [2, 4, 8, 24] as const;

/** Corpo de POST /places/:placeId/groups. Só cria quem está no lugar (posição conferida no servidor). */
export const createGroupSchema = z.object({
  position: latLngSchema,
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(280).optional(),
  /** Horas até o grupo acabar; sem o campo, o grupo não tem prazo. */
  durationHours: z
    .number()
    .int()
    .refine((h) => (GROUP_DURATION_HOURS as readonly number[]).includes(h), 'Duração inválida')
    .optional(),
});
export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const groupSchema = z.object({
  id: z.string(),
  place: z.object({ id: z.string(), name: z.string() }),
  name: z.string(),
  description: z.string().optional(),
  admin: checkinAuthorSchema,
  memberCount: z.number(),
  /** Quando o grupo acaba; sem o campo, não tem prazo. */
  expiresAt: z.string().optional(),
  isMember: z.boolean(),
  isAdmin: z.boolean(),
  createdAt: z.string(),
});
export type Group = z.infer<typeof groupSchema>;

/** GET /groups/:groupId traz também os membros. */
export const groupDetailSchema = groupSchema.extend({
  members: z.array(checkinAuthorSchema),
  /** Meu id, para o app saber quais mensagens são minhas. */
  viewerId: z.string(),
});
export type GroupDetail = z.infer<typeof groupDetailSchema>;

export const groupMessageSchema = z.object({
  id: z.string(),
  groupId: z.string(),
  sender: checkinAuthorSchema,
  text: z.string(),
  createdAt: z.string(),
});
export type GroupMessage = z.infer<typeof groupMessageSchema>;

/** Corpo de POST /groups/:groupId/messages. */
export const sendGroupMessageSchema = z.object({
  text: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH),
});

/** Eventos do Socket.IO dos grupos, mandados para cada membro. */
export const GROUP_EVENTS = {
  message: 'group:message',
  /** O grupo mudou (alguém entrou ou saiu) ou acabou; o app recarrega. */
  updated: 'group:updated',
} as const;
