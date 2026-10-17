import { z } from 'zod';
import { checkinAuthorSchema } from './checkins.js';

/** Tamanho máximo de uma foto enviada. */
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const PHOTO_CAPTION_MAX_LENGTH = 200;

/** Legenda opcional, mandada no campo "caption" do multipart, antes do arquivo. */
export const photoCaptionSchema = z.string().trim().max(PHOTO_CAPTION_MAX_LENGTH).optional();

/** Foto tirada num lugar; aparece no perfil de quem postou e na página do lugar. */
export const photoSchema = z.object({
  id: z.string(),
  place: z.object({ id: z.string(), name: z.string() }),
  /** Caminho do arquivo na API (junte com o endereço da API). */
  url: z.string(),
  caption: z.string().optional(),
  author: checkinAuthorSchema,
  createdAt: z.string(),
  /** Se fui eu quem postou (então posso apagar). */
  mine: z.boolean(),
});
export type Photo = z.infer<typeof photoSchema>;

/** Paginação das fotos: `before` é o createdAt da última foto já carregada. */
export const photosQuerySchema = z.object({
  before: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(60).default(30),
});
export type PhotosQuery = z.infer<typeof photosQuerySchema>;
