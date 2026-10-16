import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { VerifyToken } from './identity.js';

/**
 * Valida ID tokens do Firebase Auth. Só precisa do ID do projeto: as chaves públicas
 * do Google são baixadas e guardadas em cache pelo firebase-admin.
 */
export function createFirebaseVerifier(projectId: string): VerifyToken {
  if (!projectId) {
    return async () => {
      throw new Error('FIREBASE_PROJECT_ID não está configurado na API');
    };
  }
  const auth = getAuth(initializeApp({ projectId }, 'checkins-auth'));
  return async (idToken) => {
    const decoded = await auth.verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      email: decoded.email,
      emailVerified: decoded.email_verified ?? false,
      name: decoded.name as string | undefined,
      picture: decoded.picture,
      provider: decoded.firebase.sign_in_provider,
    };
  };
}
