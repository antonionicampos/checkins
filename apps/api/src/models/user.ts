import type { User } from '@checkins/shared';
import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';
import type { AuthIdentity } from '../auth/identity.js';

const userSchema = new Schema(
  {
    /** UID do Firebase Auth; o login fica no Firebase e o resto do perfil fica aqui. */
    firebaseUid: { type: String, required: true, unique: true },
    email: { type: String, lowercase: true, trim: true },
    displayName: { type: String, required: true, trim: true, maxlength: 40 },
    photoUrl: { type: String },
    /** Texto curto "sobre mim" do perfil. */
    bio: { type: String, trim: true, maxlength: 160 },
    providers: { type: [String], default: [] },
    /** Tokens do Expo Push dos aparelhos da pessoa (um por aparelho com o app logado). */
    pushTokens: { type: [String], default: [] },
    /** Pessoas que este usuário bloqueou: uma não vê nem conversa com a outra. */
    blockedIds: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
    /** Conta suspensa pela moderação: a API recusa tudo dela. */
    bannedAt: { type: Date },
    banReason: { type: String },
  },
  { timestamps: true },
);

// Um aparelho pertence a uma conta só (quem entrou por último).
userSchema.index({ pushTokens: 1 });
// Quem me bloqueou (para o bloqueio valer nos dois lados).
userSchema.index({ blockedIds: 1 });

export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;

export const UserModel = model('User', userSchema);

export function toUserDto(doc: UserDoc): User {
  return {
    id: doc.id as string,
    displayName: doc.displayName,
    email: doc.email ?? undefined,
    photoUrl: doc.photoUrl ?? undefined,
    bio: doc.bio || undefined,
  };
}

/** Busca o usuário do token; no primeiro acesso, cria o perfil com os dados do Firebase. */
export async function findOrCreateUser(identity: AuthIdentity): Promise<UserDoc> {
  const fallbackName = identity.name ?? identity.email?.split('@')[0] ?? 'Sem nome';
  const doc = await UserModel.findOneAndUpdate(
    { firebaseUid: identity.uid },
    {
      $setOnInsert: {
        firebaseUid: identity.uid,
        displayName: fallbackName.slice(0, 40),
        ...(identity.picture ? { photoUrl: identity.picture } : {}),
      },
      ...(identity.email ? { $set: { email: identity.email } } : {}),
      $addToSet: { providers: identity.provider },
    },
    { upsert: true, returnDocument: 'after' },
  );
  if (doc!.bannedAt) throw new BannedError();
  return doc!;
}

/** Conta suspensa; o tratador de erros da API devolve 403 com esta mensagem. */
export class BannedError extends Error {
  readonly statusCode = 403;
  constructor() {
    super('Sua conta foi suspensa pela moderação');
  }
}


/**
 * Ids de quem eu bloqueei e de quem me bloqueou. Bloqueio vale para os dois lados:
 * ninguém do par vê o outro na presença, nas fotos e nos comentários, nem conversa com ele.
 */
export async function blockedEitherWay(me: UserDoc): Promise<Set<string>> {
  const blockedMe = await UserModel.find({ blockedIds: me._id }, { _id: 1 });
  return new Set([...me.blockedIds.map(String), ...blockedMe.map((u) => String(u._id))]);
}
