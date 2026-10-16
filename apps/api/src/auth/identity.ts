/** Quem está chamando a API, segundo o token do Firebase. */
export interface AuthIdentity {
  uid: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
  /** "password" ou "google.com". */
  provider: string;
}

/** Valida um ID token e devolve a identidade; lança erro se o token for inválido. */
export type VerifyToken = (idToken: string) => Promise<AuthIdentity>;

export class UnauthorizedError extends Error {
  statusCode = 401;
  constructor(message = 'Faça login para continuar') {
    super(message);
  }
}

export function bearerToken(header: string | undefined): string | undefined {
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}
