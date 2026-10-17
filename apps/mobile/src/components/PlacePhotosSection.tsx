import type { Photo } from '@checkins/shared';
import { PHOTO_CAPTION_MAX_LENGTH } from '@checkins/shared';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { getPlacePhotos, uploadPhoto } from '../lib/api';
import { PhotoGrid } from './PhotoGrid';

interface Props {
  placeId: string;
  /** Só quem fez check-in no lugar posta fotos dele. */
  present: boolean;
}

/** Seção "Fotos" da página do lugar: fotos que as pessoas tiraram aqui. Também aparecem no perfil delas. */
export function PlacePhotosSection({ placeId, present }: Props) {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPhotos((await getPlacePhotos(placeId)).photos);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [placeId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function pick(fromCamera: boolean) {
    setError(null);
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(fromCamera ? 'Precisamos da câmera para tirar a foto.' : 'Precisamos acessar suas fotos.');
      return;
    }
    // quality < 1 faz o Expo converter para JPEG (o iPhone tira fotos em HEIC, que a API não aceita).
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7 };
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
    if (!result.canceled) setDraft(result.assets[0]?.uri ?? null);
  }

  async function post() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const photo = await uploadPhoto(placeId, draft, caption.trim() || undefined);
      setPhotos((list) => [photo, ...(list ?? [])]);
      setDraft(null);
      setCaption('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Fotos</Text>
      {photos === null ? (
        <ActivityIndicator />
      ) : photos.length === 0 ? (
        <Text style={styles.muted}>Ninguém postou fotos daqui ainda.</Text>
      ) : (
        <PhotoGrid photos={photos} show="author" onDeleted={(p) => setPhotos((l) => l?.filter((x) => x.id !== p.id) ?? null)} />
      )}
      {error && <Text style={styles.error}>{error}</Text>}
      {draft ? (
        <View style={styles.card}>
          <Image source={{ uri: draft }} style={styles.preview} resizeMode="cover" />
          <TextInput
            style={styles.input}
            placeholder="Legenda (opcional)"
            value={caption}
            onChangeText={setCaption}
            maxLength={PHOTO_CAPTION_MAX_LENGTH}
            multiline
          />
          {busy ? (
            <ActivityIndicator />
          ) : (
            <View style={styles.actions}>
              <Pressable style={styles.button} onPress={post}>
                <Text style={styles.buttonText}>Postar</Text>
              </Pressable>
              <Pressable onPress={() => setDraft(null)}>
                <Text style={styles.link}>Cancelar</Text>
              </Pressable>
            </View>
          )}
        </View>
      ) : present ? (
        <View style={styles.actions}>
          <Pressable style={styles.chip} onPress={() => pick(true)}>
            <Text>Tirar foto</Text>
          </Pressable>
          <Pressable style={styles.chip} onPress={() => pick(false)}>
            <Text>Escolher da galeria</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.muted}>Faça check-in para postar fotos daqui.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '600' },
  muted: { color: '#666' },
  card: { padding: 12, borderRadius: 10, backgroundColor: '#f2f4f7', gap: 8 },
  preview: { width: '100%', height: 220, borderRadius: 8, backgroundColor: '#e4e7ec' },
  input: { borderWidth: 1, borderColor: '#d0d5dd', borderRadius: 8, padding: 10, backgroundColor: '#fff' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  chip: { borderWidth: 1, borderColor: '#d0d5dd', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 14 },
  button: { backgroundColor: '#1f6feb', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 18 },
  buttonText: { color: '#fff', fontWeight: '600' },
  link: { color: '#1f6feb', fontWeight: '600' },
  error: { color: '#b42318' },
});
