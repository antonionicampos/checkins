import multipart from '@fastify/multipart';
import { MENU_MAX_BYTES, type CheckinAuthor, type Menu } from '@checkins/shared';
import type { FastifyPluginAsync } from 'fastify';
import { isValidObjectId } from 'mongoose';
import { z } from 'zod';
import { deleteMedia, detectFileType, saveMedia } from '../media/storage.js';
import { CheckinModel, toAuthorDto } from '../models/checkin.js';
import { MenuModel, type MenuDoc } from '../models/menu.js';
import { PlaceModel } from '../models/place.js';
import { findOrCreateUser, UserModel, type UserDoc } from '../models/user.js';

const FOLDER = 'menus';
const placeParamsSchema = z.object({ placeId: z.string() });
const menuParamsSchema = z.object({ menuId: z.string() });
const unknownAuthor: CheckinAuthor = { id: '', displayName: 'Conta removida' };

function toMenuDto(doc: MenuDoc, uploader: CheckinAuthor, me: UserDoc): Menu {
  return {
    id: doc.id as string,
    placeId: String(doc.placeId),
    kind: doc.kind,
    url: `/media/${FOLDER}/${doc.file}`,
    uploadedBy: uploader,
    createdAt: doc.createdAt.toISOString(),
    outdatedCount: doc.outdatedBy.length,
    markedOutdatedByMe: doc.outdatedBy.some((u) => String(u) === String(me._id)),
    mine: String(doc.uploadedBy) === String(me._id),
  };
}

export const menuRoutes = (mediaDir: string): FastifyPluginAsync => async (app) => {
  await app.register(multipart, { limits: { fileSize: MENU_MAX_BYTES, files: 1 } });

  app.register(async (authed) => {
    authed.addHook('preHandler', app.requireAuth);

    /** Cardápios do lugar, do mais recente para o mais antigo. */
    authed.get('/places/:placeId/menus', async (req) => {
      const { placeId } = placeParamsSchema.parse(req.params);
      const me = await findOrCreateUser(req.identity!);
      const docs = isValidObjectId(placeId) ? await MenuModel.find({ placeId }).sort({ createdAt: -1 }).limit(20) : [];
      const users = await UserModel.find({ _id: { $in: docs.map((d) => d.uploadedBy) } });
      const authors = new Map(users.map((u) => [u.id as string, toAuthorDto(u)]));
      return { menus: docs.map((d) => toMenuDto(d, authors.get(String(d.uploadedBy)) ?? unknownAuthor, me)) };
    });

    /** Envia um cardápio (campo "file", foto JPEG/PNG/WebP ou PDF). Só quem tem check-in no lugar. */
    authed.post('/places/:placeId/menus', async (req, reply) => {
      const { placeId } = placeParamsSchema.parse(req.params);
      const place = isValidObjectId(placeId) ? await PlaceModel.findById(placeId) : null;
      if (!place) return reply.code(404).send({ error: 'Lugar não encontrado' });

      const me = await findOrCreateUser(req.identity!);
      const present = await CheckinModel.exists({ userId: me._id, placeId: place._id, presenceUntil: { $gt: new Date() } });
      if (!present) return reply.code(422).send({ error: 'Faça check-in no lugar para enviar o cardápio' });

      if (!req.isMultipart()) return reply.code(400).send({ error: 'Envie o arquivo como multipart/form-data' });
      const part = await req.file();
      if (!part) return reply.code(400).send({ error: 'Envie o arquivo no campo "file"' });
      const data = await part.toBuffer().catch((err: { code?: string }) => {
        if (err.code === 'FST_REQ_FILE_TOO_LARGE') return null;
        throw err;
      });
      if (!data) return reply.code(413).send({ error: `O arquivo pode ter no máximo ${MENU_MAX_BYTES / 1024 / 1024} MB` });

      const type = detectFileType(data);
      if (!type) return reply.code(415).send({ error: 'Envie uma foto (JPEG, PNG ou WebP) ou um PDF' });

      const file = await saveMedia(mediaDir, FOLDER, data, type.ext);
      const doc = await MenuModel.create({ placeId: place._id, uploadedBy: me._id, file, kind: type.kind, size: data.length });
      return reply.code(201).send(toMenuDto(doc, toAuthorDto(me), me));
    });

    /** Marca ou desmarca o cardápio como desatualizado. */
    authed.post('/menus/:menuId/outdated', async (req, reply) => {
      const { menuId } = menuParamsSchema.parse(req.params);
      const me = await findOrCreateUser(req.identity!);
      const doc = isValidObjectId(menuId) ? await MenuModel.findById(menuId) : null;
      if (!doc) return reply.code(404).send({ error: 'Cardápio não encontrado' });
      const marked = doc.outdatedBy.some((u) => String(u) === String(me._id));
      doc.outdatedBy = marked ? doc.outdatedBy.filter((u) => String(u) !== String(me._id)) : [...doc.outdatedBy, me._id];
      await doc.save();
      const uploader = await UserModel.findById(doc.uploadedBy);
      return toMenuDto(doc, uploader ? toAuthorDto(uploader) : unknownAuthor, me);
    });

    /** Quem enviou apaga o cardápio (e o arquivo do disco). */
    authed.delete('/menus/:menuId', async (req, reply) => {
      const { menuId } = menuParamsSchema.parse(req.params);
      const me = await findOrCreateUser(req.identity!);
      const doc = isValidObjectId(menuId) ? await MenuModel.findById(menuId) : null;
      if (!doc) return reply.code(404).send({ error: 'Cardápio não encontrado' });
      if (String(doc.uploadedBy) !== String(me._id)) {
        return reply.code(403).send({ error: 'Só quem enviou pode apagar o cardápio' });
      }
      await doc.deleteOne();
      await deleteMedia(mediaDir, FOLDER, doc.file);
      return reply.code(204).send();
    });
  });
};
