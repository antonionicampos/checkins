import { MESSAGE_MAX_LENGTH, type Contact } from '@checkins/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { getContacts, recommendPlace } from '../../lib/api';
import { colors } from '../../theme';

export default function RecommendScreen() {
  const { placeId, placeName, lat, lng } = useLocalSearchParams<{
    placeId: string;
    placeName: string;
    lat?: string;
    lng?: string;
  }>();
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getContacts()
      .then(({ contacts: list }) => setContacts(list))
      .catch((err: Error) => setError(err.message));
  }, []);

  function toggle(userId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function send() {
    setSending(true);
    setError(null);
    try {
      await recommendPlace(placeId, { userIds: [...selected], note: note.trim() || undefined });
      router.back();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  /** Para quem não usa o app: manda pelo WhatsApp ou outro app, com o link do mapa. */
  async function shareOutside() {
    const map = lat && lng ? `\nhttps://www.google.com/maps/search/?api=1&query=${lat},${lng}` : '';
    const text = `${note.trim() || `Recomendo ${placeName}`}${note.trim() ? `\n${placeName}` : ''}${map}`;
    await Share.share({ message: text });
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Recomendar' }} />
      <Text style={styles.title}>{placeName}</Text>

      <TextInput
        style={styles.input}
        placeholder="Recado (opcional), ex.: o chope daqui é ótimo"
        value={note}
        onChangeText={setNote}
        maxLength={MESSAGE_MAX_LENGTH}
        multiline
      />

      <Text style={styles.sectionTitle}>Para quem</Text>
      {contacts === null ? (
        error ? null : <ActivityIndicator />
      ) : contacts.length === 0 ? (
        <Text style={styles.muted}>
          Você ainda não tem contatos no app. Eles aparecem aqui depois que alguém aceita conversar com você.
        </Text>
      ) : (
        contacts.map((c) => {
          const on = selected.has(c.user.id);
          return (
            <Pressable key={c.user.id} style={[styles.row, on && styles.rowOn]} onPress={() => toggle(c.user.id)}>
              <Text style={styles.check}>{on ? '☑' : '☐'}</Text>
              <Text style={styles.name}>{c.user.displayName}</Text>
            </Pressable>
          );
        })
      )}

      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={[styles.button, (sending || selected.size === 0) && styles.disabled]}
        onPress={send}
        disabled={sending || selected.size === 0}
      >
        {sending ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={styles.buttonText}>
            {selected.size > 1 ? `Enviar para ${selected.size} pessoas` : 'Enviar'}
          </Text>
        )}
      </Pressable>

      <View style={styles.divider} />
      <Pressable style={styles.secondaryButton} onPress={shareOutside}>
        <Text style={styles.secondaryText}>Compartilhar fora do app</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginTop: 4 },
  muted: { color: colors.textMuted },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, minHeight: 60 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, backgroundColor: colors.surface },
  rowOn: { backgroundColor: colors.primarySoft },
  check: { fontSize: 20 },
  name: { fontWeight: '600' },
  button: { backgroundColor: colors.primary, borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: colors.onPrimary, fontWeight: '600', fontSize: 16 },
  disabled: { opacity: 0.5 },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: 4 },
  secondaryButton: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, alignItems: 'center' },
  secondaryText: { fontWeight: '600' },
  error: { color: colors.danger },
});
