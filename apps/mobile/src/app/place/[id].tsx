import {
  CHECKIN_PRESENCE_HOURS,
  distanceInMeters,
  PLACE_CATEGORY_LABELS,
  PRESENCE_RADIUS_METERS,
  type Checkin,
  type Place,
  type PlaceReviewsResponse,
  type PresenceResponse,
} from '@checkins/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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
import { createCheckin, getPlace, getPlaceReviews, getPresence, leavePlace } from '../../lib/api';
import { getCurrentPosition } from '../../lib/location';

interface Data {
  place: Place;
  presence: PresenceResponse;
  reviews: PlaceReviewsResponse;
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

function CheckinRow({ checkin }: { checkin: Checkin }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowName}>
        {checkin.author.displayName} <Text style={styles.muted}>· {timeAgo(checkin.createdAt)}</Text>
      </Text>
      {checkin.rating ? <Stars value={checkin.rating} /> : null}
      {checkin.comment ? <Text>{checkin.comment}</Text> : null}
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
      const [place, presence, reviews] = await Promise.all([getPlace(id), getPresence(id), getPlaceReviews(id)]);
      setData({ place, presence, reviews });
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const title = data?.place.name ?? name ?? '';

  if (!data) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title }} />
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  const { place, presence, reviews } = data;

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

          <Text style={styles.sectionTitle}>Quem está aqui agora</Text>
          {presence.people.length === 0 ? (
            <Text style={styles.muted}>Ninguém mais fez check-in por enquanto.</Text>
          ) : (
            presence.people.map((p) => <CheckinRow key={p.id} checkin={p} />)
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
  error: { color: '#b42318' },
});
