import { z } from 'zod';
import { PLACE_CATEGORIES } from './constants.js';
import { latLngSchema } from './geo.js';

export const placeCategorySchema = z.enum(PLACE_CATEGORIES);
export type PlaceCategory = z.infer<typeof placeCategorySchema>;

/** Lugar como a API devolve para o app. */
export const placeSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: placeCategorySchema,
  address: z.string().optional(),
  location: latLngSchema,
});
export type Place = z.infer<typeof placeSchema>;

/** Parâmetros de GET /places/nearby. */
export const nearbyPlacesQuerySchema = latLngSchema.extend({
  radius: z.coerce.number().int().min(50).max(5_000).default(1_000),
  category: placeCategorySchema.optional(),
  /** Parte do nome do lugar; não diferencia maiúsculas nem acentos. */
  q: z.string().trim().max(60).optional(),
});
export type NearbyPlacesQuery = z.infer<typeof nearbyPlacesQuerySchema>;
