import { z } from 'zod';
import { latLngSchema } from './geo.js';

/** Corpo de POST /places/:placeId/checkins. */
export const createCheckinSchema = z.object({
  /** Posição atual do usuário, conferida contra o raio do lugar. */
  position: latLngSchema,
  comment: z.string().trim().max(280).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  /** Se aparece na lista de quem está no local agora. */
  visible: z.boolean().default(true),
});
export type CreateCheckinInput = z.infer<typeof createCheckinSchema>;

/** Autor resumido de um check-in. */
export const checkinAuthorSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  photoUrl: z.string().optional(),
});
export type CheckinAuthor = z.infer<typeof checkinAuthorSchema>;

export const checkinSchema = z.object({
  id: z.string(),
  placeId: z.string(),
  author: checkinAuthorSchema,
  comment: z.string().optional(),
  rating: z.number().optional(),
  visible: z.boolean(),
  createdAt: z.string(),
  presenceUntil: z.string(),
});
export type Checkin = z.infer<typeof checkinSchema>;

/** Resposta de GET /places/:placeId/presence. */
export const presenceResponseSchema = z.object({
  /** Se quem pediu está no local agora (só então a lista vem preenchida). */
  present: z.boolean(),
  /** Meu check-in ativo neste lugar, se houver. */
  myCheckin: checkinSchema.optional(),
  /** Quem fez check-in visível aqui e ainda está presente (sem incluir quem pediu). */
  people: z.array(checkinSchema),
});
export type PresenceResponse = z.infer<typeof presenceResponseSchema>;

/** Resposta de GET /places/:placeId/checkins: comentários e notas recentes. */
export const placeReviewsResponseSchema = z.object({
  averageRating: z.number().optional(),
  ratingCount: z.number(),
  recent: z.array(checkinSchema),
});
export type PlaceReviewsResponse = z.infer<typeof placeReviewsResponseSchema>;
