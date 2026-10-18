import type { Photo } from '@checkins/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deletePhoto, mediaUrl } from '../lib/api';
import { useReport } from './ReportSheet';
import { colors } from '../theme';

interface Props {
  photos: Photo[];
  /** Chamado depois que a pessoa apaga uma foto dela. */
  onDeleted: (photo: Photo) => void;
  /** No perfil, mostra o lugar; na página do lugar, mostra quem postou. */
  show: 'place' | 'author';
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Grade de fotos em 3 colunas; tocar abre a foto grande com legenda, lugar e autor. */
export function PhotoGrid({ photos, onDeleted, show }: Props) {
  const [open, setOpen] = useState<Photo | null>(null);
  const insets = useSafeAreaInsets();
  const reporter = useReport();

  function reportPhoto(photo: Photo) {
    setOpen(null);
    // Espera a foto fechar: no iOS, um Modal não abre enquanto outro ainda está fechando.
    setTimeout(() => reporter.open({ type: 'photo', id: photo.id, label: 'esta foto' }), 400);
  }

  function go(href: Parameters<typeof router.push>[0]) {
    setOpen(null);
    router.push(href);
  }

  function remove(photo: Photo) {
    Alert.alert('Apagar foto?', 'Ela sai do seu perfil e da página do lugar.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: () => {
          deletePhoto(photo.id)
            .then(() => {
              setOpen(null);
              onDeleted(photo);
            })
            .catch((err: Error) => Alert.alert('Não consegui apagar', err.message));
        },
      },
    ]);
  }

  return (
    <>
      <View style={styles.grid}>
        {photos.map((p) => (
          <Pressable key={p.id} style={styles.cell} onPress={() => setOpen(p)}>
            <Image source={{ uri: mediaUrl(p.url) }} style={styles.thumb} />
          </Pressable>
        ))}
      </View>

      <Modal visible={open !== null} animationType="fade" onRequestClose={() => setOpen(null)}>
        {open && (
          <ScrollView
            style={styles.viewer}
            contentContainerStyle={[styles.viewerContent, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}
          >
            <Pressable onPress={() => setOpen(null)} hitSlop={12} style={styles.close}>
              <Text style={styles.closeText}>Fechar</Text>
            </Pressable>
            <Image source={{ uri: mediaUrl(open.url) }} style={styles.full} resizeMode="contain" />
            {open.caption ? <Text style={styles.caption}>{open.caption}</Text> : null}
            {show === 'place' ? (
              <Pressable onPress={() => go({ pathname: '/place/[id]', params: { id: open.place.id, name: open.place.name } })}>
                <Text style={styles.link}>{open.place.name}</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => go({ pathname: '/profile/[id]', params: { id: open.author.id } })}>
                <Text style={styles.link}>{open.mine ? 'Você' : open.author.displayName}</Text>
              </Pressable>
            )}
            <Text style={styles.muted}>{formatDate(open.createdAt)}</Text>
            {open.mine ? (
              <Pressable onPress={() => remove(open)}>
                <Text style={styles.danger}>Apagar foto</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => reportPhoto(open)}>
                <Text style={styles.danger}>Denunciar foto</Text>
              </Pressable>
            )}
          </ScrollView>
        )}
      </Modal>
      {reporter.sheet}
    </>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  cell: { width: '32.5%', aspectRatio: 1 },
  thumb: { flex: 1, borderRadius: 6, backgroundColor: colors.surfaceStrong },
  viewer: { flex: 1, backgroundColor: colors.black },
  viewerContent: { paddingHorizontal: 16, gap: 10 },
  close: { alignSelf: 'flex-end' },
  closeText: { color: colors.onPrimary, fontWeight: '600', fontSize: 16 },
  full: { width: '100%', aspectRatio: 3 / 4 },
  caption: { color: colors.onPrimary, fontSize: 16 },
  link: { color: colors.primaryOnDark, fontWeight: '600', fontSize: 16 },
  muted: { color: colors.textSubtle },
  danger: { color: colors.dangerOnDark, fontWeight: '600', marginTop: 8 },
});
