import type { Checkin, CheckinAuthor } from '@checkins/shared';
import { model, Schema, Types, type HydratedDocument, type InferSchemaType } from 'mongoose';
import type { UserDoc } from './user.js';

const checkinSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    placeId: { type: Schema.Types.ObjectId, ref: 'Place', required: true },
    comment: { type: String, maxlength: 280 },
    rating: { type: Number, min: 1, max: 5 },
    /** Se aparece na lista de quem está no local agora. Comentário e nota são sempre públicos. */
    visible: { type: Boolean, default: true },
    /** Até quando a pessoa conta como presente no local. O check-in em si fica no histórico. */
    presenceUntil: { type: Date, required: true },
  },
  { timestamps: true },
);

// Quem está no local agora: check-ins com presença ainda válida.
checkinSchema.index({ placeId: 1, presenceUntil: -1 });
// Presença ativa de cada usuário (só uma por vez).
checkinSchema.index({ userId: 1, presenceUntil: -1 });
// Comentários recentes do lugar.
checkinSchema.index({ placeId: 1, createdAt: -1 });

export type CheckinDoc = HydratedDocument<InferSchemaType<typeof checkinSchema>>;

export const CheckinModel = model('Checkin', checkinSchema);

export function toAuthorDto(user: Pick<UserDoc, 'id' | 'displayName' | 'photoUrl'>): CheckinAuthor {
  return { id: user.id as string, displayName: user.displayName, photoUrl: user.photoUrl ?? undefined };
}

export function toCheckinDto(doc: CheckinDoc, author: CheckinAuthor): Checkin {
  return {
    id: doc.id as string,
    placeId: (doc.placeId as Types.ObjectId).toString(),
    author,
    comment: doc.comment ?? undefined,
    rating: doc.rating ?? undefined,
    visible: doc.visible,
    createdAt: doc.createdAt.toISOString(),
    presenceUntil: doc.presenceUntil.toISOString(),
  };
}
