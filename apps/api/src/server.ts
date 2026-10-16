import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { connectMongo, disconnectMongo } from './db.js';
import { attachRealtime } from './realtime/socket.js';

const config = loadConfig();
const app = await buildApp(config);

await connectMongo(config.MONGO_URL);
const io = attachRealtime(app.server, config);

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
