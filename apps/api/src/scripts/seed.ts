/**
 * Cria alguns lugares de exemplo em volta de uma posição, para testar o app
 * antes de importar dados reais. Uso: npm run seed -w @checkins/api
 * Posição: SEED_LAT/SEED_LNG (padrão: Av. Paulista, São Paulo).
 */
import { toGeoPoint, type PlaceCategory } from '@checkins/shared';
import { loadConfig } from '../config.js';
import { connectMongo, disconnectMongo } from '../db.js';
import { PlaceModel } from '../models/place.js';

const center = {
  lat: Number(process.env.SEED_LAT ?? -23.5614),
  lng: Number(process.env.SEED_LNG ?? -46.6559),
};

const samples: Array<{ name: string; category: PlaceCategory; dLat: number; dLng: number }> = [
  { name: 'Bar do Exemplo', category: 'bar', dLat: 0.0004, dLng: 0.0002 },
  { name: 'Restaurante Teste', category: 'restaurante', dLat: -0.0006, dLng: 0.0005 },
  { name: 'Café de Mentira', category: 'cafe', dLat: 0.001, dLng: -0.0008 },
  { name: 'Academia Demo', category: 'academia', dLat: -0.0015, dLng: -0.001 },
];

const config = loadConfig();
await connectMongo(config.MONGO_URL);
await PlaceModel.syncIndexes();

for (const s of samples) {
  const externalId = `seed:${s.name}`;
  await PlaceModel.updateOne(
    { 'source.provider': 'manual', 'source.externalId': externalId },
    {
      $set: {
        name: s.name,
        category: s.category,
        location: toGeoPoint({ lat: center.lat + s.dLat, lng: center.lng + s.dLng }),
        source: { provider: 'manual', externalId },
      },
    },
    { upsert: true },
  );
}

console.log(`${samples.length} lugares de exemplo prontos perto de ${center.lat}, ${center.lng}`);
await disconnectMongo();
