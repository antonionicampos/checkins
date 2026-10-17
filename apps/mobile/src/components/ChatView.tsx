import { MESSAGE_MAX_LENGTH } from '@checkins/shared';
import { router } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardOverlap } from '../lib/keyboard';

export interface ChatItem {
  id: string;
  text: string;
  createdAt: string;
  mine: boolean;
  /** Nome de quem mandou, mostrado acima do balão (nos grupos). */
  senderName?: string;
  /** Lugar recomendado na mensagem: vira um cartão que abre a página do lugar. */
  place?: { id: string; name: string };
}

/** Junta mensagens novas sem repetir (a mesma pode chegar pela resposta da API e pelo tempo real). */
export function mergeMessages<T extends { id: string; createdAt: string }>(list: T[], incoming: T[]): T[] {
  const byId = new Map(list.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

interface Props {
  messages: ChatItem[];
  /** Texto quando não há mensagens. */
  emptyText: string;
  /** Sem `onSend`, a caixa de texto não aparece. */
  onSend?: (text: string) => Promise<void>;
  error?: string | null;
  /** Algo para mostrar acima das mensagens (ex.: dados do grupo). */
  header?: ReactNode;
  /** Toque longo numa mensagem de outra pessoa (para denunciar). */
  onLongPressMessage?: (item: ChatItem) => void;
}

/** Tela de chat: lista com a mensagem mais nova embaixo e a caixa de texto acima do teclado. */
export function ChatView({ messages, emptyText, onSend, error, header, onLongPressMessage }: Props) {
  const insets = useSafeAreaInsets();
  const rootRef = useRef<View>(null);
  const keyboard = useKeyboardOverlap(rootRef);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    const trimmed = text.trim();
    if (!trimmed || !onSend) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setText('');
    } catch {
      // A tela mostra o erro; o texto fica na caixa para tentar de novo.
    } finally {
      setSending(false);
    }
  }

  // Mais nova primeiro, para a lista invertida mostrar a mais nova embaixo.
  const data = [...messages].reverse();

  return (
    <View ref={rootRef} style={[styles.flex, { paddingBottom: keyboard }]}>
      {header}
      <FlatList
        style={styles.flex}
        data={data}
        inverted
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={[styles.muted, styles.flipped]}>{emptyText}</Text>}
        renderItem={({ item, index }) => {
          // O nome aparece só na primeira de uma sequência de mensagens da mesma pessoa.
          const previous = data[index + 1];
          const showName = !item.mine && item.senderName && previous?.senderName !== item.senderName;
          return (
            <View style={[styles.bubbleWrap, item.mine ? styles.right : styles.left]}>
              {showName && <Text style={styles.sender}>{item.senderName}</Text>}
              <Pressable
                style={[styles.bubble, item.mine ? styles.mine : styles.theirs]}
                onLongPress={!item.mine && onLongPressMessage ? () => onLongPressMessage(item) : undefined}
              >
                <Text style={item.mine ? styles.mineText : undefined}>{item.text}</Text>
                {item.place && (
                  <Pressable
                    style={styles.placeCard}
                    onPress={() => router.push({ pathname: '/place/[id]', params: { id: item.place!.id, name: item.place!.name } })}
                  >
                    <Text style={styles.placeLabel}>Lugar recomendado</Text>
                    <Text style={styles.placeName}>{item.place.name}</Text>
                    <Text style={styles.placeLink}>Ver o lugar</Text>
                  </Pressable>
                )}
              </Pressable>
            </View>
          );
        }}
      />
      {error ? <Text style={[styles.error, styles.padded]}>{error}</Text> : null}
      {onSend && (
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
  list: { padding: 16, gap: 6, flexGrow: 1 },
  muted: { color: '#666', textAlign: 'center' },
  // A lista é invertida (mais nova embaixo); o aviso de lista vazia precisa ser desvirado.
  flipped: { transform: [{ scaleY: -1 }] },
  bubbleWrap: { maxWidth: '80%', gap: 2 },
  left: { alignSelf: 'flex-start' },
  right: { alignSelf: 'flex-end' },
  sender: { fontSize: 12, color: '#666', marginLeft: 4 },
  bubble: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14 },
  mine: { backgroundColor: '#1f6feb' },
  theirs: { backgroundColor: '#f2f4f7' },
  mineText: { color: '#fff' },
  placeCard: { marginTop: 8, padding: 10, borderRadius: 10, backgroundColor: '#fff', gap: 2, minWidth: 180 },
  placeLabel: { fontSize: 12, color: '#666' },
  placeName: { fontWeight: '700', color: '#101828' },
  placeLink: { color: '#1f6feb', fontWeight: '600' },
  composer: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderColor: '#eaecf0' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxHeight: 120,
  },
  send: { backgroundColor: '#1f6feb', borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center' },
  sendText: { color: '#fff', fontWeight: '600' },
  disabled: { opacity: 0.6 },
  error: { color: '#b42318' },
  padded: { paddingHorizontal: 16 },
});
