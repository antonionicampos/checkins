import { GROUP_EVENTS, REALTIME_EVENTS, type Conversation, type Group } from '@checkins/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { answerConversation, getConversations, getMyGroups } from '../../lib/api';
import { expiryLabel } from '../../lib/groups';
import { useRealtime, useRealtimeReconnect } from '../../lib/realtime';
import { colors } from '../../theme';

export default function ConversationsScreen() {
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [convs, mine] = await Promise.all([getConversations(), getMyGroups()]);
      setConversations(convs.conversations);
      setGroups(mine.groups);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  // Recarrega ao voltar para a tela e quando chega convite, resposta ou mensagem.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useRealtime(REALTIME_EVENTS.conversationUpdated, () => void load());
  useRealtime(REALTIME_EVENTS.messageNew, () => void load());
  useRealtime(GROUP_EVENTS.updated, () => void load());
  useRealtimeReconnect(() => void load());

  async function answer(id: string, action: 'accept' | 'decline') {
    try {
      const updated = await answerConversation(id, action);
      if (action === 'accept') router.push({ pathname: '/conversations/[id]', params: { id: updated.id } });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!conversations) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  return (
    <FlatList
      data={conversations}
      keyExtractor={(c) => c.id}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
      ListHeaderComponent={
        <View style={styles.headerBlock}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.sectionTitle}>Meus grupos</Text>
          {groups.length === 0 ? (
            <Text style={styles.muted}>Você não está em nenhum grupo. Entre ou crie um na página de um lugar.</Text>
          ) : (
            groups.map((g) => (
              <Pressable
                key={g.id}
                style={styles.card}
                onPress={() => router.push({ pathname: '/groups/[id]', params: { id: g.id } })}
              >
                <Text style={styles.name}>{g.name}</Text>
                <Text style={styles.muted}>
                  {g.place.name} · {g.memberCount} {g.memberCount === 1 ? 'pessoa' : 'pessoas'} ·{' '}
                  {expiryLabel(g.expiresAt)}
                </Text>
              </Pressable>
            ))
          )}
          <Text style={styles.sectionTitle}>Conversas</Text>
        </View>
      }
      ListEmptyComponent={
        <Text style={styles.muted}>
          Nenhuma conversa ainda. Faça check-in num lugar e puxe conversa com quem está lá.
        </Text>
      }
      renderItem={({ item }) => {
        const incoming = item.status === 'pending' && !item.requestedByMe;
        const last = item.lastMessage;
        return (
          <Pressable
            style={styles.card}
            disabled={incoming}
            onPress={() => router.push({ pathname: '/conversations/[id]', params: { id: item.id } })}
          >
            <Text style={styles.name}>{item.other.displayName}</Text>
            <Text style={styles.muted}>Em {item.place.name}</Text>
            {item.status === 'pending' && item.requestedByMe && (
              <Text style={styles.muted}>Convite enviado, esperando resposta</Text>
            )}
            {incoming && (
              <>
                <Text>Quer conversar com você.</Text>
                <View style={styles.actions}>
                  <Pressable style={styles.accept} onPress={() => answer(item.id, 'accept')}>
                    <Text style={styles.acceptText}>Aceitar</Text>
                  </Pressable>
                  <Pressable style={styles.decline} onPress={() => answer(item.id, 'decline')}>
                    <Text>Recusar</Text>
                  </Pressable>
                </View>
              </>
            )}
            {last && (
              <Text numberOfLines={1}>
                {last.senderId !== item.other.id ? 'Você: ' : ''}
                {last.text}
              </Text>
            )}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  list: { padding: 16, gap: 12 },
  headerBlock: { gap: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '600' },
  card: { padding: 14, borderRadius: 10, backgroundColor: colors.surface, gap: 4 },
  name: { fontSize: 16, fontWeight: '600' },
  muted: { color: colors.textMuted },
  actions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  accept: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 },
  acceptText: { color: colors.onPrimary, fontWeight: '600' },
  decline: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 },
  error: { color: colors.danger, marginBottom: 8 },
});
