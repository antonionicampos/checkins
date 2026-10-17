import { GROUP_EVENTS, type GroupDetail, type GroupMessage } from '@checkins/shared';
import { Link, router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChatView, mergeMessages } from '../../../components/ChatView';
import { IconButton } from '../../../components/IconButton';
import { useReport } from '../../../components/ReportSheet';
import { ApiError, getBlocks, getGroup, getGroupMessages, joinGroup, sendGroupMessage } from '../../../lib/api';
import { expiryLabel } from '../../../lib/groups';
import { useRealtime, useRealtimeReconnect } from '../../../lib/realtime';

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** O grupo acabou ou a pessoa foi removida. */
  const [gone, setGone] = useState<string | null>(null);
  /** Quem eu bloqueei: a API já não manda as mensagens antigas, e aqui filtro as que chegam em tempo real. */
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const reporter = useReport();

  useEffect(() => {
    getBlocks()
      .then(({ users }) => setBlocked(new Set(users.map((u) => u.id))))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      const detail = await getGroup(id);
      setGroup(detail);
      if (detail.isMember) {
        const { messages: msgs } = await getGroupMessages(id);
        setMessages((current) => mergeMessages(current, msgs));
      }
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setGone('Este grupo foi encerrado ou acabou o prazo.');
      else setError((err as Error).message);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => state === 'active' && void load());
    return () => sub.remove();
  }, [load]);
  useRealtimeReconnect(() => void load());

  useRealtime<GroupMessage>(GROUP_EVENTS.message, (m) => {
    if (m.groupId === id && !blocked.has(m.sender.id)) setMessages((current) => mergeMessages(current, [m]));
  });
  useRealtime<{ groupId: string }>(GROUP_EVENTS.updated, (e) => {
    if (e.groupId === id) void load();
  });

  async function join() {
    try {
      await joinGroup(id);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function send(text: string) {
    try {
      const message = await sendGroupMessage(id, text);
      setMessages((current) => mergeMessages(current, [message]));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  }

  if (gone) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{gone}</Text>
        <IconButton icon="arrow-back" label="Voltar" onPress={() => router.back()} />
      </View>
    );
  }

  if (!group) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  const header = (
    <View style={styles.header}>
      <Text style={styles.muted}>
        {group.place.name} · {group.memberCount} {group.memberCount === 1 ? 'pessoa' : 'pessoas'} ·{' '}
        {expiryLabel(group.expiresAt)}
      </Text>
      {group.description ? <Text>{group.description}</Text> : null}
      {!group.isMember && (
        <Pressable style={styles.button} onPress={join}>
          <Text style={styles.buttonText}>Entrar no grupo</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: group.name,
          headerRight: () => (
            <Link href={{ pathname: '/groups/[id]/members', params: { id } }} asChild>
              <IconButton icon="people-outline" label="Membros do grupo" />
            </Link>
          ),
        }}
      />
      {reporter.sheet}
      <ChatView
        header={header}
        onLongPressMessage={(m) => reporter.open({ type: 'groupMessage', id: m.id, label: 'esta mensagem' })}
        messages={messages.map((m) => ({ ...m, mine: m.sender.id === group.viewerId, senderName: m.sender.displayName }))}
        emptyText={
          group.isMember
            ? 'Nenhuma mensagem ainda. Comece a conversa!'
            : 'Entre no grupo para ver e mandar mensagens. É preciso ter check-in no lugar.'
        }
        onSend={group.isMember ? send : undefined}
        error={error}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  header: { padding: 12, gap: 6, borderBottomWidth: 1, borderColor: '#eaecf0' },
  muted: { color: '#666' },
  button: { backgroundColor: '#1f6feb', borderRadius: 8, padding: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#b42318' },
});
