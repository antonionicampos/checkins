import type { GroupDetail } from '@checkins/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useReport } from '../../../components/ReportSheet';
import { closeGroup, getGroup, leaveGroup, removeGroupMember } from '../../../lib/api';
import { colors } from '../../../theme';

export default function GroupMembersScreen() {
  const reporter = useReport();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setGroup(await getGroup(id));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Pede confirmação e roda a ação; erros aparecem na tela. */
  function confirm(title: string, message: string, action: () => Promise<void>) {
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Confirmar',
        style: 'destructive',
        onPress: () => {
          action().catch((err: Error) => setError(err.message));
        },
      },
    ]);
  }

  if (!group) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  return (
    <FlatList
      data={group.members}
      keyExtractor={(m) => m.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <Text style={styles.muted}>Quem criou o grupo administra: pode remover pessoas e encerrar o grupo.</Text>
      }
      renderItem={({ item }) => {
        const isAdmin = item.id === group.admin.id;
        return (
          <View style={styles.row}>
            <Pressable onPress={() => router.push({ pathname: '/profile/[id]', params: { id: item.id } })}>
              <Text style={styles.name}>
                {item.displayName}
                {item.id === group.viewerId ? ' (você)' : ''}
                {isAdmin ? ' · administra' : ''}
              </Text>
            </Pressable>
            {group.isAdmin && !isAdmin && (
              <Pressable
                onPress={() =>
                  confirm('Remover do grupo?', `${item.displayName} sai do grupo e não poderá voltar.`, async () => {
                    await removeGroupMember(id, item.id);
                    await load();
                  })
                }
              >
                <Text style={styles.danger}>Remover</Text>
              </Pressable>
            )}
          </View>
        );
      }}
      ListFooterComponent={
        <View style={styles.footer}>
          {error && <Text style={styles.error}>{error}</Text>}
          {group.isAdmin ? (
            <Pressable
              style={styles.dangerButton}
              onPress={() =>
                confirm('Encerrar o grupo?', 'O grupo e todas as mensagens serão apagados.', async () => {
                  await closeGroup(id);
                  router.dismissTo('/');
                })
              }
            >
              <Text style={styles.dangerButtonText}>Encerrar grupo</Text>
            </Pressable>
          ) : group.isMember ? (
            <Pressable
              style={styles.dangerButton}
              onPress={() =>
                confirm('Sair do grupo?', 'Você pode entrar de novo enquanto estiver no lugar.', async () => {
                  await leaveGroup(id);
                  router.dismissTo('/');
                })
              }
            >
              <Text style={styles.dangerButtonText}>Sair do grupo</Text>
            </Pressable>
          ) : null}
          {!group.isAdmin && (
            <Pressable onPress={() => reporter.open({ type: 'group', id, label: 'este grupo' })}>
              <Text style={styles.reportLink}>Denunciar grupo</Text>
            </Pressable>
          )}
          {reporter.sheet}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  reportLink: { color: colors.danger, fontWeight: '600', textAlign: 'center', marginTop: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  list: { padding: 16, gap: 8 },
  muted: { color: colors.textMuted, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  name: { fontWeight: '600', flexShrink: 1 },
  danger: { color: colors.danger, fontWeight: '600' },
  footer: { marginTop: 16, gap: 8 },
  dangerButton: { borderWidth: 1, borderColor: colors.danger, borderRadius: 8, padding: 12, alignItems: 'center' },
  dangerButtonText: { color: colors.danger, fontWeight: '600' },
  error: { color: colors.danger },
});
