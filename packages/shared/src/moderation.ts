import { z } from 'zod';
import { checkinAuthorSchema } from './checkins.js';

/** O que dá para denunciar. */
export const REPORT_TARGET_TYPES = ['user', 'photo', 'menu', 'checkin', 'message', 'groupMessage', 'group'] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_REASONS = ['spam', 'harassment', 'offensive', 'sexual', 'fake', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: 'Spam ou propaganda',
  harassment: 'Assédio ou ameaça',
  offensive: 'Discurso de ódio ou ofensivo',
  sexual: 'Conteúdo sexual',
  fake: 'Falso ou enganoso',
  other: 'Outro motivo',
};

export const REPORT_DETAILS_MAX_LENGTH = 500;

/** Corpo de POST /reports. */
export const createReportSchema = z.object({
  targetType: z.enum(REPORT_TARGET_TYPES),
  targetId: z.string(),
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(REPORT_DETAILS_MAX_LENGTH).optional(),
});
export type CreateReportInput = z.infer<typeof createReportSchema>;

/** GET /me/blocks: pessoas que eu bloqueei. */
export const blocksResponseSchema = z.object({ users: z.array(checkinAuthorSchema) });
export type BlocksResponse = z.infer<typeof blocksResponseSchema>;

/** Limite de mensagens (conversas e grupos somados) por pessoa, contra spam. */
export const MESSAGE_RATE_LIMIT = { count: 20, windowSeconds: 60 } as const;
