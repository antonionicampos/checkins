import type { ReportTargetType } from '@checkins/shared';
import { isValidObjectId, type Types } from 'mongoose';
import { deleteMedia } from '../media/storage.js';
import { CheckinModel } from '../models/checkin.js';
import { ConversationModel, MessageModel } from '../models/conversation.js';
import { GroupMessageModel, GroupModel } from '../models/group.js';
import { MenuModel } from '../models/menu.js';
import { PhotoModel } from '../models/photo.js';
import { UserModel } from '../models/user.js';

export interface ReportTarget {
  /** Dono do conteúdo (quem postou, escreveu ou administra). */
  userId?: Types.ObjectId;
  snapshot: string;
}

/**
 * Acha o conteúdo denunciado. `viewerId` é quem denuncia: mensagens só podem ser denunciadas
 * por quem participa da conversa ou do grupo. Devolve null se não existe ou não é visível para essa pessoa.
 */
export async function findReportTarget(
  type: ReportTargetType,
  id: string,
  viewerId: Types.ObjectId,
): Promise<ReportTarget | null> {
  if (!isValidObjectId(id)) return null;
  switch (type) {
    case 'user': {
      const u = await UserModel.findById(id);
      return u ? { userId: u._id, snapshot: `${u.displayName}${u.bio ? ` · ${u.bio}` : ''}` } : null;
    }
    case 'photo': {
      const p = await PhotoModel.findById(id);
      return p ? { userId: p.userId, snapshot: `foto ${p.file}${p.caption ? ` · ${p.caption}` : ''}` } : null;
    }
    case 'menu': {
      const m = await MenuModel.findById(id);
      return m ? { userId: m.uploadedBy, snapshot: `cardápio ${m.file}` } : null;
    }
    case 'checkin': {
      const c = await CheckinModel.findById(id);
      return c ? { userId: c.userId, snapshot: c.comment ?? '(sem comentário)' } : null;
    }
    case 'message': {
      const m = await MessageModel.findById(id);
      if (!m) return null;
      const inConversation = await ConversationModel.exists({ _id: m.conversationId, participants: viewerId });
      return inConversation ? { userId: m.senderId, snapshot: m.text } : null;
    }
    case 'groupMessage': {
      const m = await GroupMessageModel.findById(id);
      if (!m) return null;
      const inGroup = await GroupModel.exists({ _id: m.groupId, memberIds: viewerId });
      return inGroup ? { userId: m.senderId, snapshot: m.text } : null;
    }
    case 'group': {
      const g = await GroupModel.findById(id);
      return g ? { userId: g.adminId, snapshot: `${g.name}${g.description ? ` · ${g.description}` : ''}` } : null;
    }
  }
}

/** Remove o conteúdo denunciado (a moderação decidiu). Usuário denunciado é suspenso. */
export async function removeReportTarget(type: ReportTargetType, id: Types.ObjectId, mediaDir: string) {
  switch (type) {
    case 'user':
      await UserModel.updateOne({ _id: id }, { bannedAt: new Date(), banReason: 'denúncia' });
      return;
    case 'photo': {
      const p = await PhotoModel.findByIdAndDelete(id);
      if (p) await deleteMedia(mediaDir, 'photos', p.file);
      return;
    }
    case 'menu': {
      const m = await MenuModel.findByIdAndDelete(id);
      if (m) await deleteMedia(mediaDir, 'menus', m.file);
      return;
    }
    case 'checkin':
      // O check-in fica (conta como visita); some só o comentário.
      await CheckinModel.updateOne({ _id: id }, { $unset: { comment: 1 } });
      return;
    case 'message':
      await MessageModel.deleteOne({ _id: id });
      return;
    case 'groupMessage':
      await GroupMessageModel.deleteOne({ _id: id });
      return;
    case 'group':
      await Promise.all([GroupModel.deleteOne({ _id: id }), GroupMessageModel.deleteMany({ groupId: id })]);
      return;
  }
}
