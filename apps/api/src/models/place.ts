import { PLACE_CATEGORIES, type Place } from '@checkins/shared';
import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

const placeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, enum: PLACE_CATEGORIES, required: true },
    address: { type: String, trim: true },
    /** GeoJSON [longitude, latitude]; o índice 2dsphere permite buscar por distância. */
    location: {
      type: { type: String, enum: ['Point'], required: true, default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    /** Origem do cadastro, para importar de OpenStreetMap/Google depois sem duplicar. */
    source: {
      provider: { type: String, enum: ['manual', 'osm', 'google'], default: 'manual' },
      externalId: { type: String },
    },
  },
  { timestamps: true },
);

placeSchema.index({ location: '2dsphere' });
placeSchema.index(
  { 'source.provider': 1, 'source.externalId': 1 },
  { unique: true, partialFilterExpression: { 'source.externalId': { $exists: true } } },
);

export type PlaceDoc = HydratedDocument<InferSchemaType<typeof placeSchema>>;

export const PlaceModel = model('Place', placeSchema);

export function toPlaceDto(doc: PlaceDoc): Place {
  const [lng = 0, lat = 0] = doc.location?.coordinates ?? [];
  return {
    id: doc.id as string,
    name: doc.name,
    category: doc.category as Place['category'],
    address: doc.address ?? undefined,
    location: { lat, lng },
  };
}
