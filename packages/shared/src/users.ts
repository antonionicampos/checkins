import { z } from 'zod';

/** Tamanho máximo do texto "sobre mim" do perfil. */
export const BIO_MAX_LENGTH = 160;

/** Usuário como a API devolve para o app. */
export const userSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  email: z.string().optional(),
  photoUrl: z.string().optional(),
  bio: z.string().optional(),
});
export type User = z.infer<typeof userSchema>;

/** Corpo de PATCH /me. Campos ausentes ficam como estão; bio vazia apaga o texto. */
export const updateMeSchema = z.object({
  displayName: z.string().trim().min(2).max(40).optional(),
  bio: z.string().trim().max(BIO_MAX_LENGTH).optional(),
});
export type UpdateMeInput = z.infer<typeof updateMeSchema>;

/** Perfil público de alguém (GET /users/:id). O e-mail não aparece. */
export const profileSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  photoUrl: z.string().optional(),
  bio: z.string().optional(),
  /** Se é o perfil de quem está vendo (então pode editar). */
  isMe: z.boolean(),
  checkinCount: z.number(),
  /** Quantos lugares diferentes a pessoa já visitou. */
  placeCount: z.number(),
  photoCount: z.number(),
  memberSince: z.string(),
});
export type Profile = z.infer<typeof profileSchema>;
