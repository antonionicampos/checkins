import { z } from 'zod';
import { checkinAuthorSchema } from './checkins.js';

/** Tamanho máximo de um cardápio enviado (foto ou PDF). */
export const MENU_MAX_BYTES = 10 * 1024 * 1024;

export const MENU_KINDS = ['image', 'pdf'] as const;

export const menuSchema = z.object({
  id: z.string(),
  placeId: z.string(),
  kind: z.enum(MENU_KINDS),
  /** Caminho do arquivo na API (junte com o endereço da API). */
  url: z.string(),
  uploadedBy: checkinAuthorSchema,
  /** Data de envio, mostrada para a pessoa saber se o cardápio é recente. */
  createdAt: z.string(),
  /** Quantas pessoas marcaram como desatualizado. */
  outdatedCount: z.number(),
  markedOutdatedByMe: z.boolean(),
  /** Se fui eu quem enviou (então posso apagar). */
  mine: z.boolean(),
});
export type Menu = z.infer<typeof menuSchema>;
