import {
  CHECKIN_PRESENCE_HOURS,
  distanceInMeters,
  PLACE_CATEGORY_LABELS,
  PRESENCE_RADIUS_METERS,
  type Checkin,
  type Group,
  type Place,
  type PlaceReviewsResponse,
  type PresenceResponse,
} from '@checkins/shared';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  createCheckin,
  getPlace,
  getPlaceGroups,
  getPlaceReviews,
  getPresence,
  joinGroup,
  leavePlace,
  startConversation,
} from '../../lib/api';
import { expiryLabel } from '../../lib/groups';
import { getCurrentPosition } from '../../lib/location';

interface Data {
  place: Place;
  presence: PresenceResponse;
  reviews: PlaceReviewsResponse;
  groups: Group[];
}

function timeAgo(iso: string): string {
  const minutes = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return `há ${Math.round(hours / 24)} d`;
}

function Stars({ value }: { value: number }) {
  return <Text style={styles.stars}>{'★'.repeat(value) + '☆'.repeat(5 - value)}</Text>;
}

function CheckinRow({ checkin, children }: { checkin: Checkin; children?: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowName}>
        {checkin.author.displayName} <Text style={styles.muted}>· {timeAgo(checkin.createdAt)}</Text>
      </Text>
      {checkin.rating ? <Stars value={checkin.rating} /> : null}
      {checkin.comment ? <Text>{checkin.comment}</Text> : null}
      {children}
    </View>
  );
}

export default function PlaceScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Formulário de check-in
  const [comment, setComment] = useState('');
  const [rating, setRating] = useState<number | undefined>();
  const [visible, setVisible] = useState(true);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [place, presence, reviews, { groups }] = await Promise.all([
        getPlace(id),
        getPresence(id),
        getPlaceReviews(id),
        getPlaceGroups(id),
      ]);
      setData({ place, presence, reviews, groups });
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id]);

  // Recarrega também ao voltar de outra tela (ex.: depois de criar um grupo).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function doCheckin() {
    if (!data) return;
    setBusy(true);
    setFormError(null);
    try {
      const position = await getCurrentPosition();
      const distance = distanceInMeters(position, data.place.location);
      if (distance > PRESENCE_RADIUS_METERS) {
        throw new Error(
          `Você está a ${Math.round(distance)} m daqui. O check-in só vale a até ${PRESENCE_RADIUS_METERS} m do lugar.`,
        );
      }
      await createCheckin(id, { position, comment: comment.trim() || undefined, rating, visible });
      setComment('');
      setRating(undefined);
      await load();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    setBusy(true);
    try {
      await leavePlace();
      await load();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Convida para conversar (ou abre a conversa, se já existir). */
  async function talkTo(userId: string) {
    setFormError(null);
    try {
      const conversation = await startConversation({ userId, placeId: id });
      router.push({ pathname: '/conversations/[id]', params: { id: conversation.id } });
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  /** Abre o grupo; quem ainda não é membro entra antes (exige check-in aqui). */
  async function openGroup(group: Group) {
    setFormError(null);
    try {
      if (!group.isMember) await joinGroup(group.id);
      router.push({ pathname: '/groups/[id]', params: { id: group.id } });
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  const title = data?.place.name ?? name ?? '';

  if (!data) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title }} />
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  const { place, presence, reviews, groups } = data;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title }} />

      <View>
        <Text style={styles.title}>{place.name}</Text>
        <Text style={styles.muted}>
          {PLACE_CATEGORY_LABELS[place.category]}
          {place.address ? ` · ${place.address}` : ''}
        </Text>
        {reviews.averageRating !== undefined && (
          <Text style={styles.muted}>
            ★ {reviews.averageRating.toFixed(1)} ({reviews.ratingCount} {reviews.ratingCount === 1 ? 'nota' : 'notas'})
          </Text>
        )}
      </View>

      {presence.present ? (
        <View style={styles.section}>
          <Text style={styles.here}>Você está aqui</Text>
          <Text style={styles.muted}>
            Sua presença vale até {new Date(presence.myCheckin!.presenceUntil).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
            {presence.myCheckin!.visible ? '' : ' (você não aparece na lista)'}.
          </Text>
          <Pressable style={styles.secondaryButton} onPress={leave} disabled={busy}>
            <Text style={styles.secondaryText}>Sair do local</Text>
          </Pressable>

          {formError && <Text style={styles.error}>{formError}</Text>}
          <Text style={styles.sectionTitle}>Quem está aqui agora</Text>
          {presence.people.length === 0 ? (
            <Text style={styles.muted}>Ninguém mais fez check-in por enquanto.</Text>
          ) : (
            presence.people.map((p) => (
              <CheckinRow key={p.id} checkin={p}>
                <Pressable style={styles.talkButton} onPress={() => talkTo(p.author.id)}>
                  <Text style={styles.talkText}>Puxar conversa</Text>
                </Pressable>
              </CheckinRow>
            ))
          )}
        </View>
      ) : (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Fazer check-in</Text>
          <Text style={styles.muted}>
            Vale a até {PRESENCE_RADIUS_METERS} m do lugar, por {CHECKIN_PRESENCE_HOURS} horas. Depois você vê quem
            mais está aqui.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Comentário (opcional)"
            value={comment}
            onChangeText={setComment}
            maxLength={280}
            multiline
          />
          <View style={styles.ratingRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setRating(rating === n ? undefined : n)} hitSlop={6}>
                <Text style={styles.ratingStar}>{rating !== undefined && n <= rating ? '★' : '☆'}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.flex}>Aparecer para quem está aqui</Text>
            <Switch value={visible} onValueChange={setVisible} />
          </View>
          {formError && <Text style={styles.error}>{formError}</Text>}
          <Pressable style={[styles.button, busy && styles.disabled]} onPress={doCheckin} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Fazer check-in</Text>}
          </Pressable>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Grupos aqui</Text>
        {groups.length === 0 ? (
          <Text style={styles.muted}>Nenhum grupo aberto neste lugar.</Text>
        ) : (
          groups.map((g) => (
            <Pressable key={g.id} style={styles.row} onPress={() => openGroup(g)}>
              <Text style={styles.rowName}>{g.name}</Text>
              <Text style={styles.muted}>
                {g.memberCount} {g.memberCount === 1 ? 'pessoa' : 'pessoas'} · {expiryLabel(g.expiresAt)}
              </Text>
              {g.description ? <Text>{g.description}</Text> : null}
              <Text style={styles.link}>{g.isMember ? 'Abrir' : presence.present ? 'Entrar' : 'Faça check-in para entrar'}</Text>
            </Pressable>
          ))
        )}
        {presence.present && (
          <Pressable
            style={styles.secondaryButton}
            onPress={() => router.push({ pathname: '/groups/new', params: { placeId: id, placeName: place.name } })}
          >
            <Text style={styles.secondaryText}>Criar grupo</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Comentários recentes</Text>
        {reviews.recent.length === 0 ? (
          <Text style={styles.muted}>Ninguém comentou ainda.</Text>
        ) : (
          reviews.recent.map((c) => <CheckinRow key={c.id} checkin={c} />)
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 16, gap: 24 },
  title: { fontSize: 24, fontWeight: '700' },
  muted: { color: '#666' },
  section: { gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '600' },
  here: { fontSize: 18, fontWeight: '600', color: '#067647' },
  row: { padding: 12, borderRadius: 10, backgroundColor: '#f2f4f7', gap: 4 },
  rowName: { fontWeight: '600' },
  stars: { color: '#dc6803' },
  input: { borderWidth: 1, borderColor: '#d0d5dd', borderRadius: 8, padding: 12, minHeight: 60 },
  ratingRow: { flexDirection: 'row', gap: 8 },
  ratingStar: { fontSize: 28, color: '#dc6803' },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  button: { backgroundColor: '#1f6feb', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  secondaryButton: { borderWidth: 1, borderColor: '#d0d5dd', borderRadius: 8, padding: 12, alignItems: 'center' },
  secondaryText: { fontWeight: '600' },
  disabled: { opacity: 0.6 },
  link: { color: '#1f6feb', fontWeight: '600', marginTop: 2 },
  talkButton: { alignSelf: 'flex-start', marginTop: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, backgroundColor: '#1f6feb' },
  talkText: { color: '#fff', fontWeight: '600' },
  error: { color: '#b42318' },
});
