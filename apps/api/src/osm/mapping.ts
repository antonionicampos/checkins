import { toGeoPoint, type GeoPoint, type PlaceCategory } from '@checkins/shared';

/** Elemento como a Overpass API devolve com `out center tags`. */
export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  /** Centro de ways e relations (prédios, áreas). */
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface ImportedPlace {
  name: string;
  category: PlaceCategory;
  address?: string;
  location: GeoPoint;
  source: { provider: 'osm'; externalId: string };
}

/** Tags do OpenStreetMap que viram cada categoria do app. */
const AMENITY_CATEGORIES: Record<string, PlaceCategory> = {
  bar: 'bar',
  pub: 'bar',
  biergarten: 'bar',
  restaurant: 'restaurante',
  fast_food: 'restaurante',
  food_court: 'restaurante',
  cafe: 'cafe',
  ice_cream: 'cafe',
  nightclub: 'balada',
};
const LEISURE_CATEGORIES: Record<string, PlaceCategory> = {
  fitness_centre: 'academia',
};

export function categoryFromTags(tags: Record<string, string>): PlaceCategory | undefined {
  return (
    (tags.amenity && AMENITY_CATEGORIES[tags.amenity]) ||
    (tags.leisure && LEISURE_CATEGORIES[tags.leisure]) ||
    undefined
  );
}

function addressFromTags(tags: Record<string, string>): string | undefined {
  const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(', ');
  const parts = [street, tags['addr:suburb']].filter(Boolean);
  return parts.length ? parts.join(' - ') : undefined;
}

/** Converte um elemento do OpenStreetMap num lugar do app; devolve null se faltar nome, posição ou categoria. */
export function elementToPlace(el: OverpassElement): ImportedPlace | null {
  const tags = el.tags ?? {};
  const name = tags.name?.trim();
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  const category = categoryFromTags(tags);
  if (!name || lat === undefined || lng === undefined || !category) return null;
  return {
    name,
    category,
    address: addressFromTags(tags),
    location: toGeoPoint({ lat, lng }),
    source: { provider: 'osm', externalId: `${el.type}/${el.id}` },
  };
}

/** Consulta Overpass: lugares com nome das categorias do app dentro do município. */
export function buildOverpassQuery(city: string): string {
  const amenities = Object.keys(AMENITY_CATEGORIES).join('|');
  const leisures = Object.keys(LEISURE_CATEGORIES).join('|');
  const safeCity = city.replace(/["\\]/g, '');
  return `[out:json][timeout:300];
area["name"="${safeCity}"]["boundary"="administrative"]["admin_level"="8"]->.city;
(
  nwr["amenity"~"^(${amenities})$"]["name"](area.city);
  nwr["leisure"~"^(${leisures})$"]["name"](area.city);
);
out center tags;`;
}
