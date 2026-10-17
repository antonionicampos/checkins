import { MENU_KINDS } from '@checkins/shared';
import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

const menuSchema = new Schema(
  {
    placeId: { type: Schema.Types.ObjectId, ref: 'Place', required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** Nome do arquivo na pasta de mídia (aleatório, para não ser adivinhado). */
    file: { type: String, required: true },
    kind: { type: String, enum: MENU_KINDS, required: true },
    size: { type: Number, required: true },
    /** Quem marcou como desatualizado. */
    outdatedBy: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
  },
  { timestamps: true },
);

menuSchema.index({ placeId: 1, createdAt: -1 });

export type MenuDoc = HydratedDocument<InferSchemaType<typeof menuSchema>>;
export const MenuModel = model('Menu', menuSchema);
