import { buildApp } from './app.js';
import { createFirebaseVerifier } from './auth/firebase.js';
import { loadConfig } from './config.js';
import { connectMongo, disconnectMongo } from './db.js';
import { attachRealtime } from './realtime/socket.js';

const config = loadConfig();
const verifyToken = createFirebaseVerifier(config.FIREBASE_PROJECT_ID);
const app = await buildApp(config, { verifyToken });
if (!config.FIREBASE_PROJECT_ID) app.log.warn('FIREBASE_PROJECT_ID vazio: rotas com login vão falhar');

await connectMongo(config.MONGO_URL);
const io = attachRealtime(app.server, config, verifyToken);

await app.listen({ host: config.HOST, port: config.PORT });

async function shutdown(signal: string) {
  app.log.info({ signal }, 'encerrando');
  io.disconnectSockets(true);
  await app.close();
  await disconnectMongo();
  process.exit(0);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
