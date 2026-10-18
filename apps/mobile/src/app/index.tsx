import {
  distanceInMeters,
  PLACE_CATEGORIES,
  PLACE_CATEGORY_LABELS,
  type LatLng,
  type Place,
  type PlaceCategory,
} from '@checkins/shared';
import { Link, Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { IconButton, NAV_ICON_COLOR } from '../components/IconButton';
import { PlacesMap, type MapArea } from '../components/PlacesMap';
import { API_URL, getHealth, getNearbyPlaces } from '../lib/api';
import { getCurrentPosition, LocationPermissionError } from '../lib/location';
import { colors } from '../theme';

type Mode = 'list' | 'map';

export default function NearbyPlacesScreen() {
  const { profile } = useAuth();
  const [here, setHere] = useState<LatLng | null>(null);
  const [apiOk, setApiOk] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [places, setPlaces] = useState<Place[]>([]);
  const [mode, setMode] = useState<Mode>('list');
  const [category, setCategory] = useState<PlaceCategory | undefined>();
  const [searchText, setSearchText] = useState('');
  const [query, setQuery] = useState('');
  /** Área escolhida no mapa ("Buscar nesta área"); sem ela, busca perto de você. */
  const [area, setArea] = useState<MapArea | null>(null);

  const header = (
    <Stack.Screen
      options={{
        headerLeft: () => (
          <Link href="/conversations" asChild>
            <IconButton icon="chatbubbles-outline" label="Conversas e grupos" />
          </Link>
        ),
        // O perfil carrega logo depois do login; até lá, o link fica escondido.
        headerRight: () =>
          profile ? (
            <Link href={{ pathname: '/profile/[id]', params: { id: profile.id } }} asChild>
              <IconButton icon="person-circle-outline" label="Meu perfil" />
            </Link>
          ) : null,
      }}
    />
  );

  const locate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [position, health] = await Promise.all([getCurrentPosition(), getHealth()]);
      setApiOk(health.status === 'ok');
      setHere(position);
    } catch (err) {
      setLoading(false);
      setError(
        err instanceof LocationPermissionError
          ? err.message
          : `Não consegui falar com a API em ${API_URL}. ${(err as Error).message}`,
      );
    }
  }, []);

  useEffect(() => {
    void locate();
  }, [locate]);

  // Busca de novo sempre que muda a posição, a área do mapa, a categoria ou o texto.
  useEffect(() => {
    if (!here) return;
    let cancelled = false;
    setLoading(true);
    const center = area?.center ?? here;
    getNearbyPlaces({ ...center, radius: area?.radius, category, q: query || undefined })
      .then((res) => {
        if (cancelled) return;
        setPlaces(res.places);
        setError(null);
      })
      .catch((err: Error) => !cancelled && setError(`Não consegui buscar os lugares. ${err.message}`))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [here, area, category, query]);

  if (!here) {
    return (
      <View style={styles.center}>
        {header}
        {error ? (
          <>
            <Text style={styles.message}>{error}</Text>
            <Pressable style={styles.button} onPress={locate}>
              <Text style={styles.buttonText}>Tentar de novo</Text>
            </Pressable>
          </>
        ) : (
          <ActivityIndicator />
        )}
      </View>
    );
  }

  const filters = (
    <View style={styles.filters}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.search}
          placeholder="Buscar pelo nome"
          value={searchText}
          onChangeText={(text) => {
            setSearchText(text);
            if (!text) setQuery('');
          }}
          onSubmitEditing={() => setQuery(searchText.trim())}
          returnKeyType="search"
          clearButtonMode="while-editing"
          maxLength={60}
        />
        <View style={styles.toggle}>
          {(['list', 'map'] as const).map((m) => (
            <IconButton
              key={m}
              icon={m === 'list' ? 'list' : 'map-outline'}
              label={m === 'list' ? 'Ver em lista' : 'Ver no mapa'}
              size={20}
              color={mode === m ? colors.onPrimary : NAV_ICON_COLOR}
              accessibilityState={{ selected: mode === m }}
              style={[styles.toggleItem, mode === m && styles.toggleActive]}
              onPress={() => setMode(m)}
            />
          ))}
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {[undefined, ...PLACE_CATEGORIES].map((c) => (
          <Pressable
            key={c ?? 'todos'}
            style={[styles.chip, category === c && styles.chipActive]}
            onPress={() => setCategory(c)}
          >
            <Text style={[styles.chipText, category === c && styles.chipTextActive]}>
              {c ? PLACE_CATEGORY_LABELS[c] : 'Todos'}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {area && (
        <Pressable onPress={() => setArea(null)}>
          <Text style={styles.areaNote}>
            Mostrando a área escolhida no mapa. <Text style={styles.headerLink}>Voltar para perto de mim</Text>
          </Text>
        </Pressable>
      )}
      {!apiOk && <Text style={styles.warning}>A API está no ar, mas o banco de dados não respondeu.</Text>}
      {error && <Text style={styles.warning}>{error}</Text>}
    </View>
  );

  return (
    <View style={styles.screen}>
      {header}
      {filters}
      {mode === 'map' ? (
        <View style={styles.screen}>
          <PlacesMap center={area?.center ?? here} places={places} onSearchArea={setArea} />
          {loading && <ActivityIndicator style={styles.mapLoading} />}
        </View>
      ) : (
        <FlatList
          data={places}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          onRefresh={locate}
          refreshing={loading}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            profile && !query && !category && !area ? (
              <Text style={styles.greeting}>Olá, {profile.displayName}!</Text>
            ) : null
          }
          ListEmptyComponent={
            loading ? null : (
              <Text style={styles.message}>
                {query || category ? 'Nenhum lugar encontrado com esse filtro.' : 'Nenhum lugar cadastrado por perto ainda.'}
              </Text>
            )
          }
          ListFooterComponent={<Text style={styles.attribution}>Dados de lugares © OpenStreetMap contributors</Text>}
          renderItem={({ item }) => (
            <Link href={{ pathname: '/place/[id]', params: { id: item.id, name: item.name } }} asChild>
              <Pressable style={styles.card}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>
                  {PLACE_CATEGORY_LABELS[item.category]} · {Math.round(distanceInMeters(here, item.location))} m
                </Text>
              </Pressable>
            </Link>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  filters: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 8, backgroundColor: colors.background },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  search: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
  },
  toggle: { flexDirection: 'row', borderWidth: 1, borderColor: colors.primary, borderRadius: 8, overflow: 'hidden' },
  toggleItem: { paddingHorizontal: 12, paddingVertical: 8 },
  toggleActive: { backgroundColor: colors.primary },
  chips: { gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.primary },
  chipText: { color: colors.textSecondary },
  chipTextActive: { color: colors.onPrimary, fontWeight: '600' },
  areaNote: { color: colors.textSecondary, fontSize: 13 },
  list: { padding: 16, gap: 12 },
  message: { textAlign: 'center', color: colors.textSecondary },
  greeting: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  headerLink: { color: colors.primary, fontWeight: '600' },
  warning: { color: colors.warning },
  card: { padding: 16, borderRadius: 12, backgroundColor: colors.surface },
  name: { fontSize: 16, fontWeight: '600' },
  meta: { marginTop: 4, color: colors.textMuted },
  attribution: { textAlign: 'center', color: colors.textSubtle, fontSize: 12, marginTop: 8 },
  mapLoading: { position: 'absolute', top: 56, alignSelf: 'center' },
  button: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.primary },
  buttonText: { color: colors.onPrimary, fontWeight: '600' },
});
