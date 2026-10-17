import type { AuthIdentity } from '../auth/identity.js';
import { buildApp, type AppDeps } from '../app.js';

export const TEST_MONGO_URL = process.env.MONGO_URL_TEST;

// Os testes apagam coleções inteiras: só rodam num banco cujo nome indique que é de teste.
if (TEST_MONGO_URL && !/\/[^/?]*test[^/?]*(\?|$)/i.test(TEST_MONGO_URL)) {
  throw new Error(`MONGO_URL_TEST precisa apontar para um banco de teste (nome com "test"): ${TEST_MONGO_URL}`);
}

/** Nos testes, o token é "test:<uid>" e vira uma identidade sem falar com o Firebase. */
export async function fakeVerifyToken(token: string): Promise<AuthIdentity> {
  const uid = token.startsWith('test:') ? token.slice(5) : undefined;
  if (!uid) throw new Error('token inválido');
  return { uid, email: `${uid}@exemplo.com`, emailVerified: true, provider: 'password' };
}

export function authHeader(uid: string) {
  return { authorization: `Bearer test:${uid}` };
}

export function buildTestApp(deps: Partial<AppDeps> = {}) {
  return buildApp({ CORS_ORIGIN: '*', LOG_LEVEL: 'silent' }, { verifyToken: fakeVerifyToken, ...deps });
}
