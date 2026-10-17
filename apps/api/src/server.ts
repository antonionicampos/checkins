import { buildApp } from './app.js';
import { createFirebaseVerifier } from './auth/firebase.js';
import { loadConfig } from './config.js';
import { connectMongo, disconnectMongo } from './db.js';
import { UserModel } from './models/user.js';
import { createExpoPushSender } from './push/sender.js';
import { userRoom } from './realtime/notify.js';
import { attachRealtime } from './realtime/socket.js';
import type { Server } from 'socket.io';

const config = loadConfig();
const verifyToken = createFirebaseVerifier(config.FIREBASE_PROJECT_ID);
// O Socket.IO só existe depois do app (usa o mesmo servidor HTTP); até lá, os eventos são descartados.
let io: Server | undefined;
const app = await buildApp(config, {
  verifyToken,
  notify: (uid, event, payload) => io?.to(userRoom(uid)).emit(event, payload),
  push: (message) => pushSender(message),
});
const pushSender = createExpoPushSender({
  accessToken: config.EXPO_ACCESS_TOKEN || undefined,
  log: app.log,
  // Aparelho que desinstalou o app ou tirou a permissão: para de receber.
  onInvalidToken: async (token) => {
    await UserModel.updateMany({ pushTokens: token }, { $pull: { pushTokens: token } });
  },
});
if (!config.FIREBASE_PROJECT_ID) app.log.warn('FIREBASE_PROJECT_ID vazio: rotas com login vão falhar');

await connectMongo(config.MONGO_URL);
io = attachRealtime(app.server, config, verifyToken);

await app.listen({ host: config.HOST, port: config.PORT });

async function shutdown(signal: string) {
  app.log.info({ signal }, 'encerrando');
  io?.disconnectSockets(true);
  await app.close();
  await disconnectMongo();
  process.exit(0);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
