import {
  REPORT_DETAILS_MAX_LENGTH,
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  type ReportReason,
  type ReportTargetType,
} from '@checkins/shared';
import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { report } from '../lib/api';
import { colors } from '../theme';

interface Target {
  type: ReportTargetType;
  id: string;
  /** Como o alvo aparece no título, ex.: "esta foto". */
  label: string;
}

/**
 * Denúncia: `open(alvo)` mostra a folha com os motivos; `sheet` precisa estar na tela.
 * A denúncia vai para a moderação, que revisa e decide.
 */
export function useReport() {
  const [target, setTarget] = useState<Target | null>(null);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  function open(next: Target) {
    setTarget(next);
    setReason(null);
    setDetails('');
    setError(null);
  }

  async function send() {
    if (!target || !reason) return;
    setSending(true);
    setError(null);
    try {
      await report({ targetType: target.type, targetId: target.id, reason, details: details.trim() || undefined });
      setTarget(null);
      Alert.alert('Denúncia enviada', 'Obrigado. A moderação vai revisar.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  const sheet = (
    <Modal visible={target !== null} transparent animationType="slide" onRequestClose={() => setTarget(null)}>
      <Pressable style={styles.backdrop} onPress={() => setTarget(null)} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.title}>Denunciar {target?.label}</Text>
        {REPORT_REASONS.map((r) => (
          <Pressable key={r} style={[styles.option, reason === r && styles.optionOn]} onPress={() => setReason(r)}>
            <Text style={reason === r ? styles.optionOnText : undefined}>{REPORT_REASON_LABELS[r]}</Text>
          </Pressable>
        ))}
        <TextInput
          style={styles.input}
          placeholder="Conte mais (opcional)"
          value={details}
          onChangeText={setDetails}
          maxLength={REPORT_DETAILS_MAX_LENGTH}
          multiline
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <View style={styles.actions}>
          <Pressable onPress={() => setTarget(null)}>
            <Text style={styles.link}>Cancelar</Text>
          </Pressable>
          <Pressable style={[styles.button, (!reason || sending) && styles.disabled]} onPress={send} disabled={!reason || sending}>
            {sending ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.buttonText}>Enviar denúncia</Text>}
          </Pressable>
        </View>
      </View>
    </Modal>
  );

  return { open, sheet };
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.backdrop },
  sheet: { backgroundColor: colors.background, padding: 16, gap: 8, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  option: { padding: 12, borderRadius: 10, backgroundColor: colors.surface },
  optionOn: { backgroundColor: colors.danger },
  optionOnText: { color: colors.onPrimary, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, minHeight: 50 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 16, marginTop: 4 },
  button: { backgroundColor: colors.danger, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16 },
  buttonText: { color: colors.onPrimary, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  link: { color: colors.primary, fontWeight: '600' },
  error: { color: colors.danger },
});
