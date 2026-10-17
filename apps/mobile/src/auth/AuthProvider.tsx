import type { User } from '@checkins/shared';
import { onAuthStateChanged, signOut as firebaseSignOut, type User as FirebaseUser } from 'firebase/auth';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getMe } from '../lib/api';
import { auth } from '../lib/firebase';
import { signOutFromGoogle } from '../lib/google';
import { closeRealtime } from '../lib/realtime';

interface AuthState {
  /** Ainda descobrindo se há alguém logado (ao abrir o app). */
  initializing: boolean;
  firebaseUser: FirebaseUser | null;
  /** Perfil guardado na nossa API; null enquanto carrega ou se a API não respondeu. */
  profile: User | null;
  profileError: string | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initializing, setInitializing] = useState(true);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const refreshProfile = useCallback(async () => {
    try {
      setProfile(await getMe());
      setProfileError(null);
    } catch (err) {
      setProfileError((err as Error).message);
    }
  }, []);

  useEffect(
    () =>
      onAuthStateChanged(auth, (user) => {
        setFirebaseUser(user);
        setProfile(null);
        setInitializing(false);
        if (user) void refreshProfile();
      }),
    [refreshProfile],
  );

  const signOut = useCallback(async () => {
    closeRealtime();
    await signOutFromGoogle();
    await firebaseSignOut(auth);
  }, []);

  const value = useMemo(
    () => ({ initializing, firebaseUser, profile, profileError, refreshProfile, signOut }),
    [initializing, firebaseUser, profile, profileError, refreshProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
