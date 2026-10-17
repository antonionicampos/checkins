import { MESSAGE_MAX_LENGTH, REALTIME_EVENTS, type Conversation, type Message } from '@checkins/shared';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getConversation, getMessages, sendMessage } from '../../lib/api';
import { useKeyboardOverlap } from '../../lib/keyboard';
import { useRealtime, useRealtimeReconnect } from '../../lib/realtime';

/** Junta mensagens novas sem repetir (a mesma pode chegar pela resposta da API e pelo tempo real). */
function merge(list: Message[], incoming: Message[]): Message[] {
  const byId = new Map(list.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const rootRef = useRef<View>(null);
  const keyboard = useKeyboardOverlap(rootRef);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [conv, { messages: msgs }] = await Promise.all([getConversation(id), getMessages(id)]);
      setConversation(conv);
      setMessages((current) => merge(current, msgs));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id]);

  // Recarrega ao abrir a tela, ao voltar para o app e quando o tempo real reconecta:
  // mensagens que chegaram nesses intervalos não vieram pelo Socket.IO.
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

  useRealtime<Message>(REALTIME_EVENTS.messageNew, (m) => {
    if (m.conversationId === id) setMessages((current) => merge(current, [m]));
  });
  useRealtime<Conversation>(REALTIME_EVENTS.conversationUpdated, (c) => {
    if (c.id === id) setConversation(c);
  });

  async function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      const message = await sendMessage(id, trimmed);
      setMessages((current) => merge(current, [message]));
      setText('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  if (!conversation) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  const accepted = conversation.status === 'accepted';
  return (
    <View ref={rootRef} style={[styles.flex, { paddingBottom: keyboard }]}>
      <Stack.Screen options={{ title: conversation.other.displayName }} />
      <FlatList
        style={styles.flex}
        data={[...messages].reverse()}
        inverted
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={[styles.muted, styles.flipped]}>
            {accepted
              ? `Vocês se encontraram em ${conversation.place.name}. Diga oi!`
              : conversation.requestedByMe
                ? `Convite enviado. A conversa começa quando ${conversation.other.displayName} aceitar.`
                : 'Aceite o convite na lista de conversas para começar.'}
          </Text>
        }
        renderItem={({ item }) => {
          // Compara com a outra pessoa da conversa (sempre carregada aqui) em vez do meu perfil,
          // que pode ainda não ter carregado e fazia todas as mensagens aparecerem como da outra pessoa.
          const mine = item.senderId !== conversation.other.id;
          return (
            <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
              <Text style={mine ? styles.mineText : undefined}>{item.text}</Text>
            </View>
          );
        }}
      />
      {error && <Text style={[styles.error, styles.padded]}>{error}</Text>}
      {accepted && (
        <View style={[styles.composer, { paddingBottom: keyboard > 0 ? 12 : 12 + insets.bottom }]}>
          <TextInput
            style={styles.input}
            placeholder="Mensagem"
            value={text}
            onChangeText={setText}
            maxLength={MESSAGE_MAX_LENGTH}
            multiline
          />
          <Pressable style={[styles.send, sending && styles.disabled]} onPress={send} disabled={sending}>
            <Text style={styles.sendText}>Enviar</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  list: { padding: 16, gap: 6, flexGrow: 1 },
  muted: { color: '#666', textAlign: 'center' },
  // A lista é invertida (mais nova embaixo); o aviso de lista vazia precisa ser desvirado.
  flipped: { transform: [{ scaleY: -1 }] },
  bubble: { maxWidth: '80%', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14 },
  mine: { alignSelf: 'flex-end', backgroundColor: '#1f6feb' },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#f2f4f7' },
  mineText: { color: '#fff' },
  composer: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderColor: '#eaecf0' },
  input: { flex: 1, borderWidth: 1, borderColor: '#d0d5dd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, maxHeight: 120 },
  send: { backgroundColor: '#1f6feb', borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center' },
  sendText: { color: '#fff', fontWeight: '600' },
  disabled: { opacity: 0.6 },
  error: { color: '#b42318' },
  padded: { paddingHorizontal: 16 },
});
