import { REPORT_REASON_LABELS, type ReportReason, type ReportTargetType } from '@checkins/shared';
import { isValidObjectId, Types } from 'mongoose';
import { ReportModel } from '../models/report.js';
import { UserModel } from '../models/user.js';
import { removeReportTarget } from './targets.js';

export interface OpenCase {
  /** Id de uma das denúncias do caso; serve para os comandos de remover e descartar. */
  reportId: string;
  targetType: ReportTargetType;
  targetId: string;
  targetUser?: string;
  snapshot: string;
  count: number;
  reasons: string[];
  details: string[];
  firstAt: Date;
}

/** Denúncias abertas, juntas por conteúdo, das mais antigas para as mais novas. */
export async function listOpenCases(): Promise<OpenCase[]> {
  const reports = await ReportModel.find({ status: 'open' }).sort({ createdAt: 1 });
  const cases = new Map<string, OpenCase>();
  const userIds = reports.flatMap((r) => (r.targetUserId ? [r.targetUserId] : []));
  const users = new Map((await UserModel.find({ _id: { $in: userIds } })).map((u) => [String(u._id), u]));
  for (const r of reports) {
    const key = `${r.targetType}:${String(r.targetId)}`;
    const owner = r.targetUserId ? users.get(String(r.targetUserId)) : undefined;
    const c = cases.get(key) ?? {
      reportId: r.id as string,
      targetType: r.targetType,
      targetId: String(r.targetId),
      targetUser: owner ? `${owner.displayName} (${owner.id as string})` : undefined,
      snapshot: r.snapshot ?? '',
      count: 0,
      reasons: [],
      details: [],
      firstAt: r.createdAt,
    };
    c.count += 1;
    c.reasons.push(REPORT_REASON_LABELS[r.reason as ReportReason]);
    if (r.details) c.details.push(r.details);
    cases.set(key, c);
  }
  return [...cases.values()];
}

async function closeCase(reportId: string, status: 'dismissed' | 'actioned') {
  const report = isValidObjectId(reportId) ? await ReportModel.findById(reportId) : null;
  if (!report) throw new Error(`Denúncia ${reportId} não encontrada`);
  await ReportModel.updateMany(
    { targetType: report.targetType, targetId: report.targetId, status: 'open' },
    { status, resolvedAt: new Date() },
  );
  return report;
}

/** Descarta o caso: o conteúdo fica. */
export async function dismissCase(reportId: string) {
  await closeCase(reportId, 'dismissed');
}

/** Remove o conteúdo do caso (ou suspende a pessoa, se o alvo é um usuário). */
export async function removeCase(reportId: string, mediaDir: string) {
  const report = await closeCase(reportId, 'actioned');
  await removeReportTarget(report.targetType, report.targetId, mediaDir);
}

export async function banUser(userId: string, reason = 'moderação') {
  const res = await UserModel.updateOne({ _id: new Types.ObjectId(userId) }, { bannedAt: new Date(), banReason: reason });
  if (res.matchedCount === 0) throw new Error(`Usuário ${userId} não encontrado`);
}

export async function unbanUser(userId: string) {
  await UserModel.updateOne({ _id: new Types.ObjectId(userId) }, { $unset: { bannedAt: 1, banReason: 1 } });
}
