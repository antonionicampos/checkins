import { REALTIME_EVENTS, type Conversation, type Message } from '@checkins/shared';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import { ChatView, mergeMessages } from '../../components/ChatView';
import { getConversation, getMessages, sendMessage } from '../../lib/api';
import { useRealtime, useRealtimeReconnect } from '../../lib/realtime';

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [conv, { messages: msgs }] = await Promise.all([getConversation(id), getMessages(id)]);
      setConversation(conv);
      setMessages((current) => mergeMessages(current, msgs));
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
    if (m.conversationId === id) setMessages((current) => mergeMessages(current, [m]));
  });
  useRealtime<Conversation>(REALTIME_EVENTS.conversationUpdated, (c) => {
    if (c.id === id) setConversation(c);
  });

  async function send(text: string) {
    try {
      const message = await sendMessage(id, text);
      setMessages((current) => mergeMessages(current, [message]));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
      throw err;
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
  const other = conversation.other;
  return (
    <>
      <Stack.Screen options={{ title: other.displayName }} />
      <ChatView
        // Compara com a outra pessoa da conversa (sempre carregada aqui) em vez do meu perfil,
        // que pode ainda não ter carregado e fazia todas as mensagens aparecerem como da outra pessoa.
        messages={messages.map((m) => ({ ...m, mine: m.senderId !== other.id }))}
        emptyText={
          accepted
            ? `Vocês se encontraram em ${conversation.place.name}. Diga oi!`
            : conversation.requestedByMe
              ? `Convite enviado. A conversa começa quando ${other.displayName} aceitar.`
              : 'Aceite o convite na lista de conversas para começar.'
        }
        onSend={accepted ? send : undefined}
        error={error}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: '#b42318' },
});
