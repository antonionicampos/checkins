import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getReactNativePersistence, initializeAuth, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

// Sem chave, o Firebase derruba o app ao abrir; com um valor provisório, a tela de login abre e avisa.
const effectiveConfig = isFirebaseConfigured
  ? firebaseConfig
  : { ...firebaseConfig, apiKey: 'nao-configurado', projectId: 'nao-configurado' };

// getApps() evita inicializar duas vezes quando o Metro recarrega o código.
const app = getApps().length ? getApp() : initializeApp(effectiveConfig);

/** Login guardado no aparelho: a pessoa continua logada ao reabrir o app. */
export const auth: Auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});
