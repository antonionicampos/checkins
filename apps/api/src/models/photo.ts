import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

const photoSchema = new Schema(
  {
    placeId: { type: Schema.Types.ObjectId, ref: 'Place', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** Nome do arquivo na pasta de mídia (aleatório, para não ser adivinhado). */
    file: { type: String, required: true },
    caption: { type: String, trim: true, maxlength: 200 },
    size: { type: Number, required: true },
  },
  { timestamps: true },
);

// Fotos do perfil e fotos do lugar, das mais recentes para as mais antigas.
photoSchema.index({ userId: 1, createdAt: -1 });
photoSchema.index({ placeId: 1, createdAt: -1 });

export type PhotoDoc = HydratedDocument<InferSchemaType<typeof photoSchema>>;
export const PhotoModel = model('Photo', photoSchema);
