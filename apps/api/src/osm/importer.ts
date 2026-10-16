import { PlaceModel } from '../models/place.js';
import { buildOverpassQuery, elementToPlace, type ImportedPlace, type OverpassElement } from './mapping.js';

export const DEFAULT_OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/** Baixa os elementos da cidade na Overpass API. */
export async function fetchOsmElements(
  city: string,
  overpassUrl = DEFAULT_OVERPASS_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<OverpassElement[]> {
  const res = await fetchImpl(overpassUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'checkins-app/0.1 (importador de lugares)',
    },
    body: new URLSearchParams({ data: buildOverpassQuery(city) }),
  });
  if (!res.ok) throw new Error(`Overpass respondeu ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { elements?: OverpassElement[] };
  return body.elements ?? [];
}

export interface ImportResult {
  received: number;
  skipped: number;
  created: number;
  updated: number;
}

/**
 * Grava os lugares no MongoDB. É idempotente: o mesmo elemento do OSM (source.externalId)
 * só atualiza o lugar existente, então dá para rodar de novo para pegar novidades.
 */
export async function upsertOsmPlaces(elements: OverpassElement[], batchSize = 1_000): Promise<ImportResult> {
  const places = elements.map(elementToPlace).filter((p): p is ImportedPlace => p !== null);
  const result: ImportResult = {
    received: elements.length,
    skipped: elements.length - places.length,
    created: 0,
    updated: 0,
  };

  for (let i = 0; i < places.length; i += batchSize) {
    const batch = places.slice(i, i + batchSize);
    const res = await PlaceModel.bulkWrite(
      batch.map(({ address, ...fields }) => ({
        updateOne: {
          filter: { 'source.provider': 'osm', 'source.externalId': fields.source.externalId },
          update: address ? { $set: { ...fields, address } } : { $set: fields, $unset: { address: 1 } },
          upsert: true,
        },
      })),
      { ordered: false },
    );
    result.created += res.upsertedCount;
    result.updated += res.matchedCount;
  }
  return result;
}
