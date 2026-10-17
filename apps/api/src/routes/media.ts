import type { FastifyPluginAsync } from 'fastify';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { MEDIA_FILE_PATTERN, MIME_BY_EXT } from '../media/storage.js';

/** Pastas de mídia que a API serve. */
export const MEDIA_FOLDERS = ['menus', 'photos'] as const;

const paramsSchema = z.object({ folder: z.string(), file: z.string() });

/**
 * Arquivos enviados (cardápios e fotos), sem login: o app abre PDFs no navegador, que não manda o token.
 * Os nomes são aleatórios e só aparecem para quem está logado.
 */
export const mediaRoutes = (mediaDir: string): FastifyPluginAsync => async (app) => {
  app.get('/media/:folder/:file', async (req, reply) => {
    const { folder, file } = paramsSchema.parse(req.params);
    if (!(MEDIA_FOLDERS as readonly string[]).includes(folder) || !MEDIA_FILE_PATTERN.test(file)) {
      return reply.code(404).send({ error: 'Arquivo não encontrado' });
    }
    const path = join(mediaDir, folder, file);
    const info = await stat(path).catch(() => null);
    if (!info) return reply.code(404).send({ error: 'Arquivo não encontrado' });
    return reply
      .header('content-type', MIME_BY_EXT[file.split('.')[1]!])
      .header('content-length', info.size)
      .header('cache-control', 'public, max-age=31536000, immutable')
      .send(createReadStream(path));
  });
};
