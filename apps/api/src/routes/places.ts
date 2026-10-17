import { nearbyPlacesQuerySchema, toGeoPoint } from '@checkins/shared';
import type { FastifyPluginAsync } from 'fastify';
import { isValidObjectId } from 'mongoose';
import { z } from 'zod';
import { PlaceModel, toPlaceDto } from '../models/place.js';

const placeParamsSchema = z.object({ placeId: z.string() });

const ACCENTS: Record<string, string> = { a: 'aáàâã', e: 'eéê', i: 'ií', o: 'oóôõ', u: 'uúü', c: 'cç' };

/** Expressão que acha `text` no nome sem diferenciar maiúsculas nem acentos ("cafe" acha "Café"). */
export function nameSearchRegex(text: string): RegExp {
  const plain = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const pattern = [...plain]
    .map((ch) => (ACCENTS[ch] ? `[${ACCENTS[ch]}]` : ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('');
  return new RegExp(pattern, 'i');
}

export const placeRoutes: FastifyPluginAsync = async (app) => {
  /** Lugares perto de uma posição, do mais próximo ao mais distante. */
  app.get('/places/nearby', async (req) => {
    const query = nearbyPlacesQuerySchema.parse(req.query);
    const docs = await PlaceModel.find({
      ...(query.category ? { category: query.category } : {}),
      ...(query.q ? { name: nameSearchRegex(query.q) } : {}),
      location: {
        $near: {
          $geometry: toGeoPoint(query),
          $maxDistance: query.radius,
        },
      },
    }).limit(50);
    return { places: docs.map(toPlaceDto) };
  });

  app.get('/places/:placeId', async (req, reply) => {
    const { placeId } = placeParamsSchema.parse(req.params);
    const doc = isValidObjectId(placeId) ? await PlaceModel.findById(placeId) : null;
    if (!doc) return reply.code(404).send({ error: 'Lugar não encontrado' });
    return toPlaceDto(doc);
  });
};
