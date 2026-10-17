import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { authErrorMessage } from '../auth/errors';
import { updateMe } from '../lib/api';
import { auth, isFirebaseConfigured } from '../lib/firebase';
import { isGoogleSignInAvailable, signInWithGoogle } from '../lib/google';

type Mode = 'entrar' | 'criar';

export default function SignInScreen() {
  const { refreshProfile, signInNotice } = useAuth();
  const [mode, setMode] = useState<Mode>('entrar');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await action();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const submit = () =>
    run(async () => {
      if (mode === 'entrar') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        return;
      }
      if (name.trim().length < 2) throw new Error('Diga como quer ser chamado (pelo menos 2 letras).');
      await createUserWithEmailAndPassword(auth, email.trim(), password);
      // O perfil nasce no primeiro GET /me; aqui só gravamos o nome escolhido.
      await updateMe({ displayName: name.trim() });
      await refreshProfile();
    });

  const resetPassword = () =>
    run(async () => {
      if (!email.trim()) throw new Error('Digite seu e-mail para receber o link.');
      await sendPasswordResetEmail(auth, email.trim());
      setInfo('Enviamos um link para criar uma nova senha.');
    });

  const google = () =>
    run(async () => {
      await signInWithGoogle();
    });

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.form}>
        <Text style={styles.title}>Check-ins</Text>
        <Text style={styles.subtitle}>
          {mode === 'entrar' ? 'Entre para ver quem está nos lugares.' : 'Crie sua conta.'}
        </Text>

        {!isFirebaseConfigured && (
          <Text style={styles.error}>Firebase não configurado: preencha apps/mobile/.env.</Text>
        )}

        {mode === 'criar' && (
          <TextInput
            style={styles.input}
            placeholder="Como quer ser chamado"
            value={name}
            onChangeText={setName}
            autoComplete="name"
          />
        )}
        <TextInput
          style={styles.input}
          placeholder="E-mail"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="Senha"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={mode === 'entrar' ? 'current-password' : 'new-password'}
        />

        {signInNotice && !error && <Text style={styles.info}>{signInNotice}</Text>}
        {error && <Text style={styles.error}>{error}</Text>}
        {info && <Text style={styles.info}>{info}</Text>}

        <Pressable style={[styles.button, busy && styles.disabled]} onPress={submit} disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{mode === 'entrar' ? 'Entrar' : 'Criar conta'}</Text>
          )}
        </Pressable>

        {isGoogleSignInAvailable() && (
          <Pressable style={[styles.googleButton, busy && styles.disabled]} onPress={google} disabled={busy}>
            <Text style={styles.googleText}>Entrar com Google</Text>
          </Pressable>
        )}

        <Pressable onPress={() => setMode(mode === 'entrar' ? 'criar' : 'entrar')} disabled={busy}>
          <Text style={styles.link}>
            {mode === 'entrar' ? 'Não tem conta? Criar conta' : 'Já tem conta? Entrar'}
          </Text>
        </Pressable>
        {mode === 'entrar' && (
          <Pressable onPress={resetPassword} disabled={busy}>
            <Text style={styles.link}>Esqueci a senha</Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', backgroundColor: '#fff' },
  form: { padding: 24, gap: 12 },
  title: { fontSize: 32, fontWeight: '700', textAlign: 'center' },
  subtitle: { textAlign: 'center', color: '#555', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#d0d5dd', borderRadius: 8, padding: 12, fontSize: 16 },
  button: { backgroundColor: '#1f6feb', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  googleButton: { borderWidth: 1, borderColor: '#d0d5dd', borderRadius: 8, padding: 14, alignItems: 'center' },
  googleText: { fontWeight: '600', fontSize: 16 },
  disabled: { opacity: 0.6 },
  link: { color: '#1f6feb', textAlign: 'center', padding: 4 },
  error: { color: '#b42318', textAlign: 'center' },
  info: { color: '#067647', textAlign: 'center' },
});
