/**
 * Importa lugares do OpenStreetMap para o MongoDB.
 * Uso: npm run import:osm -w @checkins/api -- "São Paulo"
 * A cidade é o nome do município no OSM. OVERPASS_URL troca o servidor da Overpass API.
 */
import { loadConfig } from '../config.js';
import { connectMongo, disconnectMongo } from '../db.js';
import { PlaceModel } from '../models/place.js';
import { DEFAULT_OVERPASS_URL, fetchOsmElements, upsertOsmPlaces } from '../osm/importer.js';

const city = process.argv[2] ?? 'São Paulo';
const overpassUrl = process.env.OVERPASS_URL ?? DEFAULT_OVERPASS_URL;
const config = loadConfig();

console.log(`Baixando lugares de ${city} do OpenStreetMap (pode levar alguns minutos)...`);
const elements = await fetchOsmElements(city, overpassUrl);
if (elements.length === 0) {
  console.error(`Nada encontrado para "${city}". Confira o nome do município como está no OpenStreetMap.`);
  process.exit(1);
}

await connectMongo(config.MONGO_URL);
await PlaceModel.syncIndexes();
const result = await upsertOsmPlaces(elements);
console.log(
  `${result.received} elementos recebidos: ${result.created} lugares novos, ` +
    `${result.updated} atualizados, ${result.skipped} ignorados (sem nome, posição ou categoria).`,
);
await disconnectMongo();
