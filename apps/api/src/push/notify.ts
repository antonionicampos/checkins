import type { PushData } from '@checkins/shared';
import type { Types } from 'mongoose';
import { UserModel } from '../models/user.js';
import type { PushSender } from './sender.js';

/** Tamanho máximo do texto da notificação (o resto aparece ao abrir o app). */
const BODY_MAX = 120;

export function truncate(text: string, max = BODY_MAX) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Manda uma notificação para os aparelhos de várias pessoas. */
export type PushToUsers = (
  userIds: Types.ObjectId[],
  notification: { title: string; body: string; data: PushData },
) => Promise<void>;

export function createPushToUsers(send: PushSender): PushToUsers {
  return async (userIds, notification) => {
    if (userIds.length === 0) return;
    const users = await UserModel.find({ _id: { $in: userIds }, bannedAt: { $exists: false } }, { pushTokens: 1 });
    const to = users.flatMap((u) => u.pushTokens);
    if (to.length > 0) send({ to, ...notification, body: truncate(notification.body) });
  };
}
