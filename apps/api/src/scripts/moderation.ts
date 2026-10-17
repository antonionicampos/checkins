/**
 * Moderação pela linha de comando, rodando na máquina de casa (direto no MongoDB, sem passar pela internet).
 * Uso: npm run moderation -w @checkins/api -- <comando>
 *   (sem comando)          lista as denúncias abertas, juntas por conteúdo
 *   remover <id>           remove o conteúdo denunciado (usuário denunciado é suspenso)
 *   descartar <id>         fecha o caso sem mexer no conteúdo
 *   suspender <userId> [motivo]
 *   reativar <userId>
 */
import { loadConfig } from '../config.js';
import { connectMongo, disconnectMongo } from '../db.js';
import { banUser, dismissCase, listOpenCases, removeCase, unbanUser } from '../moderation/review.js';

const config = loadConfig();
const [command, arg, ...rest] = process.argv.slice(2);
await connectMongo(config.MONGO_URL);

try {
  switch (command) {
    case undefined:
    case 'listar': {
      const cases = await listOpenCases();
      if (cases.length === 0) console.log('Nenhuma denúncia aberta.');
      for (const c of cases) {
        console.log(`\n[${c.reportId}] ${c.targetType} ${c.targetId} · ${c.count} denúncia(s) desde ${c.firstAt.toLocaleString('pt-BR')}`);
        if (c.targetUser) console.log(`  De: ${c.targetUser}`);
        console.log(`  Conteúdo: ${c.snapshot}`);
        console.log(`  Motivos: ${[...new Set(c.reasons)].join(', ')}`);
        for (const d of c.details) console.log(`  · "${d}"`);
      }
      break;
    }
    case 'remover':
      await removeCase(arg!, config.MEDIA_DIR);
      console.log('Conteúdo removido e caso fechado.');
      break;
    case 'descartar':
      await dismissCase(arg!);
      console.log('Caso descartado.');
      break;
    case 'suspender':
      await banUser(arg!, rest.join(' ') || undefined);
      console.log('Conta suspensa.');
      break;
    case 'reativar':
      await unbanUser(arg!);
      console.log('Conta reativada.');
      break;
    default:
      console.log('Comandos: listar, remover <id>, descartar <id>, suspender <userId> [motivo], reativar <userId>');
      process.exitCode = 1;
  }
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await disconnectMongo();
}
