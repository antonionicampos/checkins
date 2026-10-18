import type { CheckinAuthor } from '@checkins/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { getBlocks, unblockUser } from '../lib/api';
import { colors } from '../theme';

/** Pessoas que eu bloqueei, com o botão de desbloquear (o perfil delas some de quase todo lugar). */
export default function BlockedScreen() {
  const [users, setUsers] = useState<CheckinAuthor[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers((await getBlocks()).users);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function unblock(userId: string) {
    try {
      await unblockUser(userId);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!users) {
    return (
      <View style={styles.center}>{error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator />}</View>
    );
  }

  return (
    <FlatList
      data={users}
      keyExtractor={(u) => u.id}
      contentContainerStyle={styles.list}
      ListEmptyComponent={<Text style={styles.muted}>Você não bloqueou ninguém.</Text>}
      ListFooterComponent={error ? <Text style={styles.error}>{error}</Text> : null}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Text style={styles.name}>{item.displayName}</Text>
          <Pressable onPress={() => unblock(item.id)}>
            <Text style={styles.link}>Desbloquear</Text>
          </Pressable>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  list: { padding: 16, gap: 8 },
  muted: { color: colors.textMuted, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  name: { fontWeight: '600' },
  link: { color: colors.primary, fontWeight: '600' },
  error: { color: colors.danger },
});
