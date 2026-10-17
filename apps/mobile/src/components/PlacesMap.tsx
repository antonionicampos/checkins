import { PLACE_CATEGORY_LABELS, type LatLng, type Place } from '@checkins/shared';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';

/** Área que o mapa mostra, como centro e raio de busca (o raio da API vai de 50 a 5000 m). */
export interface MapArea {
  center: LatLng;
  radius: number;
}

function areaOf(region: Region): MapArea {
  // Meia altura do mapa, em metros (1 grau de latitude ≈ 111 km).
  const radius = Math.round((region.latitudeDelta / 2) * 111_000);
  return {
    center: { lat: region.latitude, lng: region.longitude },
    radius: Math.min(5_000, Math.max(50, radius)),
  };
}

/** Mapa com os lugares; quando a pessoa arrasta o mapa, aparece "Buscar nesta área". */
export function PlacesMap({
  center,
  places,
  onSearchArea,
}: {
  /** Onde o mapa abre: perto de você ou na última área buscada. */
  center: LatLng;
  places: Place[];
  onSearchArea: (area: MapArea) => void;
}) {
  const router = useRouter();
  const [moved, setMoved] = useState<MapArea | null>(null);
  // O primeiro onRegionChangeComplete vem da própria abertura do mapa, não da pessoa.
  const ready = useRef(false);

  return (
    <View style={styles.container}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: center.lat, longitude: center.lng, latitudeDelta: 0.018, longitudeDelta: 0.018 }}
        showsUserLocation
        showsMyLocationButton
        toolbarEnabled={false}
        onRegionChangeComplete={(region) => {
          if (ready.current) setMoved(areaOf(region));
          ready.current = true;
        }}
      >
        {places.map((p) => (
          <Marker
            key={p.id}
            coordinate={{ latitude: p.location.lat, longitude: p.location.lng }}
            title={p.name}
            description={`${PLACE_CATEGORY_LABELS[p.category]} · toque para abrir`}
            onCalloutPress={() => router.push({ pathname: '/place/[id]', params: { id: p.id, name: p.name } })}
          />
        ))}
      </MapView>
      {moved && (
        <Pressable
          style={styles.searchArea}
          onPress={() => {
            onSearchArea(moved);
            setMoved(null);
          }}
        >
          <Text style={styles.searchAreaText}>Buscar nesta área</Text>
        </Pressable>
      )}
      <Text style={styles.attribution}>Lugares © OpenStreetMap contributors</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchArea: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1f6feb',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  searchAreaText: { color: '#fff', fontWeight: '600' },
  attribution: {
    position: 'absolute',
    bottom: 4,
    left: 8,
    fontSize: 11,
    color: '#444',
    backgroundColor: 'rgba(255,255,255,0.8)',
    paddingHorizontal: 4,
  },
});
