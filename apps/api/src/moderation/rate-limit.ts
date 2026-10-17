import { MESSAGE_RATE_LIMIT } from '@checkins/shared';
import type { Types } from 'mongoose';
import { MessageModel } from '../models/conversation.js';
import { GroupMessageModel } from '../models/group.js';

/** Erro 429 quando a pessoa manda mensagens rápido demais. */
export class TooManyMessagesError extends Error {
  readonly statusCode = 429;
  constructor() {
    super('Você está mandando mensagens rápido demais. Espere um minuto.');
  }
}

/** Conta as mensagens da pessoa (conversas e grupos) no último minuto e recusa se passar do limite. */
export async function assertMessageRate(senderId: Types.ObjectId, adding = 1) {
  const since = new Date(Date.now() - MESSAGE_RATE_LIMIT.windowSeconds * 1000);
  const [direct, group] = await Promise.all([
    MessageModel.countDocuments({ senderId, createdAt: { $gt: since } }),
    GroupMessageModel.countDocuments({ senderId, createdAt: { $gt: since } }),
  ]);
  if (direct + group + adding > MESSAGE_RATE_LIMIT.count) throw new TooManyMessagesError();
}
