import { GROUP_DURATION_HOURS, PRESENCE_RADIUS_METERS } from '@checkins/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createGroup } from '../../lib/api';
import { getCurrentPosition } from '../../lib/location';
import { colors } from '../../theme';

/** Opções de duração: as temporárias do shared e "sem prazo" (undefined). */
const DURATIONS: (number | undefined)[] = [...GROUP_DURATION_HOURS, undefined];

export default function NewGroupScreen() {
  const { placeId, placeName } = useLocalSearchParams<{ placeId: string; placeName?: string }>();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [durationHours, setDurationHours] = useState<number | undefined>(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const position = await getCurrentPosition();
      const group = await createGroup(placeId, {
        position,
        name: name.trim(),
        description: description.trim() || undefined,
        durationHours,
      });
      router.replace({ pathname: '/groups/[id]', params: { id: group.id } });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.muted}>
        Grupo aberto em {placeName ?? 'este lugar'}: quem fizer check-in aqui pode entrar. Você precisa estar a até{' '}
        {PRESENCE_RADIUS_METERS} m do lugar e será quem administra o grupo.
      </Text>
      <TextInput style={styles.input} placeholder="Nome do grupo" value={name} onChangeText={setName} maxLength={60} />
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="Descrição (opcional)"
        value={description}
        onChangeText={setDescription}
        maxLength={280}
        multiline
      />
      <Text style={styles.label}>Duração</Text>
      <View style={styles.chips}>
        {DURATIONS.map((h) => {
          const selected = durationHours === h;
          return (
            <Pressable
              key={h ?? 'none'}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => setDurationHours(h)}
            >
              <Text style={selected ? styles.chipTextSelected : undefined}>{h ? `${h} h` : 'Sem prazo'}</Text>
            </Pressable>
          );
        })}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={[styles.button, (busy || name.trim().length < 2) && styles.disabled]}
        onPress={submit}
        disabled={busy || name.trim().length < 2}
      >
        {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.buttonText}>Criar grupo</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  muted: { color: colors.textMuted },
  label: { fontWeight: '600' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12 },
  multiline: { minHeight: 70 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 14 },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTextSelected: { color: colors.onPrimary, fontWeight: '600' },
  button: { backgroundColor: colors.primary, borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: colors.onPrimary, fontWeight: '600', fontSize: 16 },
  disabled: { opacity: 0.6 },
  error: { color: colors.danger },
});
