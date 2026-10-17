import { REALTIME_EVENTS, type Conversation } from '@checkins/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { answerConversation, getConversations } from '../../lib/api';
import { useRealtime, useRealtimeReconnect } from '../../lib/realtime';

export default function ConversationsScreen() {
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setConversations((await getConversations()).conversations);
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
      ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
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
  card: { padding: 14, borderRadius: 10, backgroundColor: '#f2f4f7', gap: 4 },
  name: { fontSize: 16, fontWeight: '600' },
  muted: { color: '#666' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  accept: { backgroundColor: '#1f6feb', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 },
  acceptText: { color: '#fff', fontWeight: '600' },
  decline: { borderWidth: 1, borderColor: '#d0d5dd', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 },
  error: { color: '#b42318', marginBottom: 8 },
});
