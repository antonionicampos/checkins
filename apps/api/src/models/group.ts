import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

const groupSchema = new Schema(
  {
    placeId: { type: Schema.Types.ObjectId, ref: 'Place', required: true },
    name: { type: String, required: true, maxlength: 60 },
    description: { type: String, maxlength: 280 },
    /** Quem criou é o administrador: remove membros e encerra o grupo. */
    adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    memberIds: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
    /** Removidos pelo administrador não podem entrar de novo. */
    bannedIds: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
    /** Fim do grupo temporário; sem o campo, não tem prazo. O índice TTL apaga o grupo quando vence. */
    expiresAt: { type: Date },
  },
  { timestamps: true },
);

groupSchema.index({ placeId: 1, createdAt: -1 });
groupSchema.index({ memberIds: 1 });
groupSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type GroupDoc = HydratedDocument<InferSchemaType<typeof groupSchema>>;
export const GroupModel = model('Group', groupSchema);

/** Filtro de grupos ainda ativos (o TTL do MongoDB pode levar até um minuto para apagar os vencidos). */
export function activeGroupFilter(now = new Date()) {
  return { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] };
}

const groupMessageSchema = new Schema(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, maxlength: 1000 },
    /** Mesmo prazo do grupo, para as mensagens sumirem junto com ele. */
    expiresAt: { type: Date },
  },
  { timestamps: true },
);

groupMessageSchema.index({ groupId: 1, createdAt: -1 });
groupMessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type GroupMessageDoc = HydratedDocument<InferSchemaType<typeof groupMessageSchema>>;
export const GroupMessageModel = model('GroupMessage', groupMessageSchema);
