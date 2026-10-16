import { z } from 'zod';

/** Usuário como a API devolve para o app. */
export const userSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  email: z.string().optional(),
  photoUrl: z.string().optional(),
});
export type User = z.infer<typeof userSchema>;

/** Corpo de PATCH /me. */
export const updateMeSchema = z.object({
  displayName: z.string().trim().min(2).max(40),
});
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
