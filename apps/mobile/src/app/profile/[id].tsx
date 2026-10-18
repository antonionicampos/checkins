import { BIO_MAX_LENGTH, type Photo, type Profile } from '@checkins/shared';
import { Link, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../../auth/AuthProvider';
import { PhotoGrid } from '../../components/PhotoGrid';
import { useReport } from '../../components/ReportSheet';
import { blockUser, getProfile, getUserPhotos, unblockUser, updateMe } from '../../lib/api';
import { colors } from '../../theme';

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { refreshProfile, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  /** Se a última página veio cheia, pode haver fotos mais antigas. */
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Edição do próprio perfil
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const reporter = useReport();

  const load = useCallback(async () => {
    try {
      const [p, { photos: list }] = await Promise.all([getProfile(id), getUserPhotos(id)]);
      setProfile(p);
      setPhotos(list);
      setHasMore(list.length >= 30);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id]);

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

  async function loadMore() {
    const last = photos[photos.length - 1];
    if (!last) return;
    try {
      const { photos: older } = await getUserPhotos(id, last.createdAt);
      setPhotos((list) => [...list, ...older]);
      setHasMore(older.length >= 30);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function startEditing() {
    if (!profile) return;
    setName(profile.displayName);
    setBio(profile.bio ?? '');
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updateMe({ displayName: name.trim(), bio: bio.trim() });
      await Promise.all([load(), refreshProfile()]);
      setEditing(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function toggleBlock() {
    if (!profile) return;
    if (profile.blockedByMe) {
      unblockUser(profile.id)
        .then(load)
        .catch((err: Error) => setError(err.message));
      return;
    }
    Alert.alert(
      `Bloquear ${profile.displayName}?`,
      'Vocês deixam de se ver no local, nas fotos e nos comentários, e a conversa entre vocês some. Ela não é avisada.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Bloquear',
          style: 'destructive',
          onPress: () => {
            blockUser(profile.id)
              .then(load)
              .catch((err: Error) => setError(err.message));
          },
        },
      ],
    );
  }

  if (!profile) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: '' }} />
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: profile.isMe ? 'Meu perfil' : profile.displayName }} />

      <View style={styles.header}>
        {profile.photoUrl ? (
          <Image source={{ uri: profile.photoUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarEmpty]}>
            <Text style={styles.avatarLetter}>{profile.displayName.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.flex}>
          <Text style={styles.name}>{profile.displayName}</Text>
          <Text style={styles.muted}>
            No app desde {new Date(profile.memberSince).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </Text>
        </View>
      </View>

      {editing ? (
        <View style={styles.section}>
          <Text style={styles.label}>Nome</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} maxLength={40} />
          <Text style={styles.label}>Sobre você</Text>
          <TextInput
            style={[styles.input, styles.bioInput]}
            value={bio}
            onChangeText={setBio}
            maxLength={BIO_MAX_LENGTH}
            placeholder="Ex.: gosto de bares com música ao vivo"
            multiline
          />
          {error && <Text style={styles.error}>{error}</Text>}
          {saving ? (
            <ActivityIndicator />
          ) : (
            <View style={styles.actions}>
              <Pressable style={styles.button} onPress={save}>
                <Text style={styles.buttonText}>Salvar</Text>
              </Pressable>
              <Pressable onPress={() => setEditing(false)}>
                <Text style={styles.link}>Cancelar</Text>
              </Pressable>
            </View>
          )}
        </View>
      ) : (
        <>
          {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
          {profile.isMe && (
            <Pressable style={styles.secondaryButton} onPress={startEditing}>
              <Text style={styles.secondaryText}>Editar perfil</Text>
            </Pressable>
          )}
        </>
      )}

      <View style={styles.stats}>
        <Text style={styles.stat}>{plural(profile.checkinCount, 'check-in', 'check-ins')}</Text>
        <Text style={styles.stat}>{plural(profile.placeCount, 'lugar', 'lugares')}</Text>
        <Text style={styles.stat}>{plural(profile.photoCount, 'foto', 'fotos')}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Fotos de lugares</Text>
        {photos.length === 0 ? (
          <Text style={styles.muted}>
            {profile.isMe
              ? 'Faça check-in num lugar e poste uma foto dele: ela aparece aqui.'
              : 'Nenhuma foto postada ainda.'}
          </Text>
        ) : (
          <PhotoGrid
            photos={photos}
            show="place"
            onDeleted={(p) => {
              setPhotos((list) => list.filter((x) => x.id !== p.id));
              setProfile((prev) => (prev ? { ...prev, photoCount: prev.photoCount - 1 } : prev));
            }}
          />
        )}
        {hasMore && (
          <Pressable onPress={loadMore}>
            <Text style={styles.link}>Ver mais fotos</Text>
          </Pressable>
        )}
      </View>

      {profile.isMe ? (
        <>
          <Link href="/blocked" asChild>
            <Pressable style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>Pessoas bloqueadas</Text>
            </Pressable>
          </Link>
          <Pressable style={styles.secondaryButton} onPress={signOut}>
            <Text style={styles.danger}>Sair da conta</Text>
          </Pressable>
        </>
      ) : (
        <View style={styles.actions}>
          <Pressable onPress={toggleBlock}>
            <Text style={styles.danger}>{profile.blockedByMe ? 'Desbloquear' : 'Bloquear'}</Text>
          </Pressable>
          <Pressable onPress={() => reporter.open({ type: 'user', id: profile.id, label: profile.displayName })}>
            <Text style={styles.danger}>Denunciar perfil</Text>
          </Pressable>
        </View>
      )}
      {reporter.sheet}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 16, gap: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surfaceStrong },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 30, fontWeight: '700', color: colors.textSecondary },
  flex: { flex: 1 },
  name: { fontSize: 22, fontWeight: '700' },
  bio: { fontSize: 16 },
  muted: { color: colors.textMuted },
  stats: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12, borderRadius: 10, backgroundColor: colors.surface },
  stat: { fontWeight: '600' },
  section: { gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '600' },
  label: { fontWeight: '600' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12 },
  bioInput: { minHeight: 70 },
  actions: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  button: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20 },
  buttonText: { color: colors.onPrimary, fontWeight: '600' },
  secondaryButton: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, alignItems: 'center' },
  secondaryText: { fontWeight: '600' },
  link: { color: colors.primary, fontWeight: '600' },
  danger: { color: colors.danger, fontWeight: '600' },
  error: { color: colors.danger },
});
