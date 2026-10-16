import { nearbyPlacesQuerySchema, toGeoPoint } from '@checkins/shared';
import type { FastifyPluginAsync } from 'fastify';
import { isValidObjectId } from 'mongoose';
import { z } from 'zod';
import { PlaceModel, toPlaceDto } from '../models/place.js';

const placeParamsSchema = z.object({ placeId: z.string() });

export const placeRoutes: FastifyPluginAsync = async (app) => {
  /** Lugares perto de uma posição, do mais próximo ao mais distante. */
  app.get('/places/nearby', async (req) => {
    const query = nearbyPlacesQuerySchema.parse(req.query);
    const docs = await PlaceModel.find({
      ...(query.category ? { category: query.category } : {}),
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
