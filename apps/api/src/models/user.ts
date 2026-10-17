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
  },
  { timestamps: true },
);

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
  return doc!;
}
