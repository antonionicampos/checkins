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

// getApps() evita inicializar duas vezes quando o Metro recarrega o código.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

/** Login guardado no aparelho: a pessoa continua logada ao reabrir o app. */
export const auth: Auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});
