import { z } from 'zod';

/** Corpo de POST e DELETE /me/push-tokens: o token do Expo Push deste aparelho. */
export const pushTokenSchema = z.object({
  token: z.string().regex(/^Expo(nent)?PushToken\[.+\]$/, 'Token do Expo Push inválido'),
});
export type PushTokenInput = z.infer<typeof pushTokenSchema>;

/** Dados que vão junto com a notificação; o app abre `url` (rota do Expo Router) quando a pessoa toca. */
export interface PushData {
  url: string;
}
