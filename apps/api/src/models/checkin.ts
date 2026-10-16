import { model, Schema, type InferSchemaType } from 'mongoose';

const checkinSchema = new Schema(
  {
    // TODO: virar ObjectId com ref 'User' quando o login existir.
    userId: { type: String, required: true },
    placeId: { type: Schema.Types.ObjectId, ref: 'Place', required: true },
    comment: { type: String, maxlength: 280 },
    rating: { type: Number, min: 1, max: 5 },
    visible: { type: Boolean, default: true },
    /** Até quando a pessoa conta como presente no local. O check-in em si fica no histórico. */
    presenceUntil: { type: Date, required: true },
  },
  { timestamps: true },
);

// Quem está no local agora: check-ins visíveis com presença ainda válida.
checkinSchema.index({ placeId: 1, presenceUntil: -1 });

export type Checkin = InferSchemaType<typeof checkinSchema>;

export const CheckinModel = model('Checkin', checkinSchema);
