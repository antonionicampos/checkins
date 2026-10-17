import { REPORT_REASONS, REPORT_TARGET_TYPES } from '@checkins/shared';
import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const REPORT_STATUSES = ['open', 'dismissed', 'actioned'] as const;

const reportSchema = new Schema(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: REPORT_TARGET_TYPES, required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    /** Quem escreveu ou postou o conteúdo (ou a própria pessoa, se o alvo é um usuário). */
    targetUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    /** Cópia curta do conteúdo, para a moderação ver mesmo se ele for apagado depois. */
    snapshot: { type: String, maxlength: 300 },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    details: { type: String, maxlength: 500 },
    status: { type: String, enum: REPORT_STATUSES, default: 'open' },
    resolvedAt: { type: Date },
  },
  { timestamps: true },
);

// Cada pessoa denuncia o mesmo conteúdo uma vez só.
reportSchema.index({ reporterId: 1, targetType: 1, targetId: 1 }, { unique: true });
reportSchema.index({ status: 1, createdAt: 1 });

export type ReportDoc = HydratedDocument<InferSchemaType<typeof reportSchema>>;
export const ReportModel = model('Report', reportSchema);
