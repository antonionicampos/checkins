import { distanceInMeters, PLACE_CATEGORY_LABELS, type Place } from '@checkins/shared';
import { Link, Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { API_URL, getHealth, getNearbyPlaces } from '../lib/api';
import { getCurrentPosition, LocationPermissionError } from '../lib/location';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; places: Array<Place & { distance: number }>; apiOk: boolean };

export default function NearbyPlacesScreen() {
  const { profile, signOut } = useAuth();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const header = (
    <Stack.Screen
      options={{
        headerRight: () => (
          <Pressable onPress={signOut} hitSlop={8}>
            <Text style={styles.headerLink}>Sair</Text>
          </Pressable>
        ),
      }}
    />
  );

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const here = await getCurrentPosition();
      const [health, { places }] = await Promise.all([getHealth(), getNearbyPlaces(here)]);
      setState({
        kind: 'ready',
        apiOk: health.status === 'ok',
        places: places.map((p) => ({ ...p, distance: distanceInMeters(here, p.location) })),
      });
    } catch (err) {
      setState({
        kind: 'error',
        message:
          err instanceof LocationPermissionError
            ? err.message
            : `Não consegui falar com a API em ${API_URL}. ${(err as Error).message}`,
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === 'loading') {
    return (
      <View style={styles.center}>
        {header}
        <ActivityIndicator />
      </View>
    );
  }

  if (state.kind === 'error') {
    return (
      <View style={styles.center}>
        {header}
        <Text style={styles.message}>{state.message}</Text>
        <Pressable style={styles.button} onPress={load}>
          <Text style={styles.buttonText}>Tentar de novo</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
      {header}
      <FlatList
      data={state.places}
      keyExtractor={(p) => p.id}
      contentContainerStyle={styles.list}
      onRefresh={load}
      refreshing={false}
      ListHeaderComponent={
        <>
          {profile && <Text style={styles.greeting}>Olá, {profile.displayName}!</Text>}
          {!state.apiOk && <Text style={styles.warning}>A API está no ar, mas o banco de dados não respondeu.</Text>}
        </>
      }
      ListEmptyComponent={<Text style={styles.message}>Nenhum lugar cadastrado por perto ainda.</Text>}
      ListFooterComponent={<Text style={styles.attribution}>Dados de lugares © OpenStreetMap contributors</Text>}
      renderItem={({ item }) => (
        <Link href={{ pathname: '/place/[id]', params: { id: item.id, name: item.name } }} asChild>
          <Pressable style={styles.card}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.meta}>
              {PLACE_CATEGORY_LABELS[item.category]} · {Math.round(item.distance)} m
            </Text>
          </Pressable>
        </Link>
      )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  list: { padding: 16, gap: 12 },
  message: { textAlign: 'center', color: '#444' },
  greeting: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  headerLink: { color: '#1f6feb', fontWeight: '600' },
  warning: { color: '#9a5b00', marginBottom: 8 },
  card: { padding: 16, borderRadius: 12, backgroundColor: '#f2f4f7' },
  name: { fontSize: 16, fontWeight: '600' },
  meta: { marginTop: 4, color: '#666' },
  attribution: { textAlign: 'center', color: '#888', fontSize: 12, marginTop: 8 },
  button: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, backgroundColor: '#1f6feb' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
