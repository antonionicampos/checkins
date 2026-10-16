import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { NativeModules, TurboModuleRegistry } from 'react-native';
import { auth } from './firebase';

type GoogleSigninModule = typeof import('@react-native-google-signin/google-signin');

let configured = false;
let cachedModule: GoogleSigninModule | null | undefined;

/**
 * O login com Google usa um módulo nativo, que não existe no Expo Go. Carregamos sob demanda
 * para o resto do app continuar funcionando no Expo Go.
 */
function loadGoogleSignin(): GoogleSigninModule | null {
  if (cachedModule === undefined) {
    // Confere antes de importar: o import em si já dispara um erro no Expo Go, mesmo dentro do try.
    const hasNativeModule =
      TurboModuleRegistry.get('RNGoogleSignin') != null || NativeModules.RNGoogleSignin != null;
    if (!hasNativeModule) {
      cachedModule = null;
      return cachedModule;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cachedModule = require('@react-native-google-signin/google-signin') as GoogleSigninModule;
    } catch {
      cachedModule = null;
    }
  }
  return cachedModule;
}

export function isGoogleSignInAvailable(): boolean {
  return loadGoogleSignin() !== null;
}

/** Abre a escolha de conta do Google e entra no Firebase com ela. Devolve false se a pessoa cancelar. */
export async function signInWithGoogle(): Promise<boolean> {
  const mod = loadGoogleSignin();
  if (!mod) {
    throw new Error('O login com Google precisa do build de desenvolvimento; no Expo Go, use e-mail e senha.');
  }
  const { GoogleSignin, isSuccessResponse } = mod;
  if (!configured) {
    GoogleSignin.configure({ webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID });
    configured = true;
  }
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const res = await GoogleSignin.signIn();
  if (!isSuccessResponse(res)) return false;
  if (!res.data.idToken) throw new Error('O Google não devolveu o token de login.');
  await signInWithCredential(auth, GoogleAuthProvider.credential(res.data.idToken));
  return true;
}

export async function signOutFromGoogle(): Promise<void> {
  await loadGoogleSignin()?.GoogleSignin.signOut().catch(() => undefined);
}
