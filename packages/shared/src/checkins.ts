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
