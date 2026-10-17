import { CONVERSATION_STATUSES, type Message } from '@checkins/shared';
import { model, Schema, Types, type HydratedDocument, type InferSchemaType } from 'mongoose';

const lastMessageSchema = new Schema(
  {
    messageId: { type: Schema.Types.ObjectId, required: true },
    senderId: { type: Schema.Types.ObjectId, required: true },
    text: { type: String, required: true },
    createdAt: { type: Date, required: true },
  },
  { _id: false },
);

const conversationSchema = new Schema(
  {
    /** As duas pessoas, em ordem crescente de id. */
    participants: { type: [Schema.Types.ObjectId], ref: 'User', required: true },
    /** "<idMenor>:<idMaior>": garante uma conversa só por par de pessoas. */
    pairKey: { type: String, required: true, unique: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** Lugar onde o convite foi feito. */
    placeId: { type: Schema.Types.ObjectId, ref: 'Place', required: true },
    status: { type: String, enum: CONVERSATION_STATUSES, default: 'pending' },
    lastMessage: { type: lastMessageSchema },
  },
  { timestamps: true },
);

// Conversas de cada pessoa, das mais recentes para as mais antigas.
conversationSchema.index({ participants: 1, updatedAt: -1 });

export type ConversationDoc = HydratedDocument<InferSchemaType<typeof conversationSchema>>;
export const ConversationModel = model('Conversation', conversationSchema);

export function pairKeyOf(a: Types.ObjectId | string, b: Types.ObjectId | string): string {
  return [String(a), String(b)].sort().join(':');
}

const messageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, maxlength: 1000 },
    /** Lugar recomendado; o nome fica guardado para a mensagem não depender do lugar existir. */
    place: {
      type: new Schema({ id: { type: Schema.Types.ObjectId, required: true }, name: { type: String, required: true } }, { _id: false }),
    },
  },
  { timestamps: true },
);

messageSchema.index({ conversationId: 1, createdAt: -1 });
// Limite de mensagens por minuto de cada pessoa.
messageSchema.index({ senderId: 1, createdAt: -1 });

export type MessageDoc = HydratedDocument<InferSchemaType<typeof messageSchema>>;
export const MessageModel = model('Message', messageSchema);

export function toMessageDto(doc: MessageDoc): Message {
  return {
    id: doc.id as string,
    conversationId: String(doc.conversationId),
    senderId: String(doc.senderId),
    text: doc.text,
    place: doc.place ? { id: String(doc.place.id), name: doc.place.name } : undefined,
    createdAt: doc.createdAt.toISOString(),
  };
}
