import type { Menu } from '@checkins/shared';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { deleteMenu, getMenus, mediaUrl, toggleMenuOutdated, uploadMenu } from '../lib/api';

interface Props {
  placeId: string;
  /** Só quem fez check-in no lugar envia cardápio. */
  present: boolean;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Seção "Cardápio" da página do lugar: fotos e PDFs enviados, com data de envio. */
export function MenuSection({ placeId, present }: Props) {
  const [menus, setMenus] = useState<Menu[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMenus((await getMenus(placeId)).menus);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [placeId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function send(uri: string | undefined) {
    if (!uri) return;
    setBusy(true);
    setError(null);
    try {
      await uploadMenu(placeId, uri);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function pickPhoto(fromCamera: boolean) {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(fromCamera ? 'Precisamos da câmera para fotografar o cardápio.' : 'Precisamos acessar suas fotos.');
      return;
    }
    // quality < 1 faz o Expo converter para JPEG (o iPhone tira fotos em HEIC, que a API não aceita).
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7 };
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? undefined : result.assets[0];
    await send(asset?.uri);
  }

  async function pickPdf() {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    const asset = result.canceled ? undefined : result.assets[0];
    await send(asset?.uri);
  }

  async function toggleOutdated(menu: Menu) {
    try {
      const updated = await toggleMenuOutdated(menu.id);
      setMenus((list) => list?.map((m) => (m.id === updated.id ? updated : m)) ?? null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function remove(menu: Menu) {
    Alert.alert('Apagar cardápio?', 'O arquivo que você enviou será apagado.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: () => {
          deleteMenu(menu.id)
            .then(load)
            .catch((err: Error) => setError(err.message));
        },
      },
    ]);
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Cardápio</Text>
      {menus === null ? (
        <ActivityIndicator />
      ) : menus.length === 0 ? (
        <Text style={styles.muted}>Ninguém enviou o cardápio daqui ainda.</Text>
      ) : (
        menus.map((m) => (
          <View key={m.id} style={styles.card}>
            <Pressable onPress={() => Linking.openURL(mediaUrl(m.url))}>
              {m.kind === 'image' ? (
                <Image source={{ uri: mediaUrl(m.url) }} style={styles.photo} resizeMode="cover" />
              ) : (
                <View style={styles.pdf}>
                  <Text style={styles.pdfText}>PDF · tocar para abrir</Text>
                </View>
              )}
            </Pressable>
            <Text style={styles.muted}>
              Enviado em {formatDate(m.createdAt)} por {m.mine ? 'você' : m.uploadedBy.displayName}
            </Text>
            {m.outdatedCount > 0 && (
              <Text style={styles.warning}>
                {m.outdatedCount} {m.outdatedCount === 1 ? 'pessoa marcou' : 'pessoas marcaram'} como desatualizado
              </Text>
            )}
            <View style={styles.actions}>
              <Pressable onPress={() => toggleOutdated(m)}>
                <Text style={styles.link}>
                  {m.markedOutdatedByMe ? 'Desfazer "desatualizado"' : 'Marcar como desatualizado'}
                </Text>
              </Pressable>
              {m.mine && (
                <Pressable onPress={() => remove(m)}>
                  <Text style={styles.danger}>Apagar</Text>
                </Pressable>
              )}
            </View>
          </View>
        ))
      )}
      {error && <Text style={styles.error}>{error}</Text>}
      {present ? (
        busy ? (
          <ActivityIndicator />
        ) : (
          <View style={styles.actions}>
            <Pressable style={styles.chip} onPress={() => pickPhoto(true)}>
              <Text>Fotografar</Text>
            </Pressable>
            <Pressable style={styles.chip} onPress={() => pickPhoto(false)}>
              <Text>Escolher foto</Text>
            </Pressable>
            <Pressable style={styles.chip} onPress={pickPdf}>
              <Text>Enviar PDF</Text>
            </Pressable>
          </View>
        )
      ) : (
        <Text style={styles.muted}>Faça check-in para enviar o cardápio.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '600' },
  muted: { color: '#666' },
  warning: { color: '#b54708' },
  card: { padding: 12, borderRadius: 10, backgroundColor: '#f2f4f7', gap: 6 },
  photo: { width: '100%', height: 220, borderRadius: 8, backgroundColor: '#e4e7ec' },
  pdf: { height: 80, borderRadius: 8, backgroundColor: '#e4e7ec', alignItems: 'center', justifyContent: 'center' },
  pdfText: { fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  chip: { borderWidth: 1, borderColor: '#d0d5dd', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 14 },
  link: { color: '#1f6feb', fontWeight: '600' },
  danger: { color: '#b42318', fontWeight: '600' },
  error: { color: '#b42318' },
});
