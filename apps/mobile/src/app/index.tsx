import { distanceInMeters, type Place } from '@checkins/shared';
import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { API_URL, getHealth, getNearbyPlaces } from '../lib/api';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; places: Array<Place & { distance: number }>; apiOk: boolean };

export default function NearbyPlacesScreen() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setState({ kind: 'error', message: 'Precisamos da sua localização para mostrar lugares por perto.' });
        return;
      }
      const { coords } = await Location.getCurrentPositionAsync({});
      const here = { lat: coords.latitude, lng: coords.longitude };
      const [health, { places }] = await Promise.all([getHealth(), getNearbyPlaces(here)]);
      setState({
        kind: 'ready',
        apiOk: health.status === 'ok',
        places: places.map((p) => ({ ...p, distance: distanceInMeters(here, p.location) })),
      });
    } catch (err) {
      setState({
        kind: 'error',
        message: `Não consegui falar com a API em ${API_URL}. ${(err as Error).message}`,
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (state.kind === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>{state.message}</Text>
        <Pressable style={styles.button} onPress={load}>
          <Text style={styles.buttonText}>Tentar de novo</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      data={state.places}
      keyExtractor={(p) => p.id}
      contentContainerStyle={styles.list}
      onRefresh={load}
      refreshing={false}
      ListHeaderComponent={
        state.apiOk ? undefined : <Text style={styles.warning}>A API está no ar, mas o banco de dados não respondeu.</Text>
      }
      ListEmptyComponent={<Text style={styles.message}>Nenhum lugar cadastrado por perto ainda.</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.meta}>
            {item.category} · {Math.round(item.distance)} m
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  list: { padding: 16, gap: 12 },
  message: { textAlign: 'center', color: '#444' },
  warning: { color: '#9a5b00', marginBottom: 8 },
  card: { padding: 16, borderRadius: 12, backgroundColor: '#f2f4f7' },
  name: { fontSize: 16, fontWeight: '600' },
  meta: { marginTop: 4, color: '#666' },
  button: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, backgroundColor: '#1f6feb' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
