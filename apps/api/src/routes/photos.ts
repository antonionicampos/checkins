import multipart from '@fastify/multipart';
import {
  PHOTO_MAX_BYTES,
  photoCaptionSchema,
  photosQuerySchema,
  type CheckinAuthor,
  type Photo,
} from '@checkins/shared';
import type { FastifyPluginAsync } from 'fastify';
import { isValidObjectId } from 'mongoose';
import { z } from 'zod';
import { deleteMedia, detectFileType, saveMedia } from '../media/storage.js';
import { CheckinModel, toAuthorDto } from '../models/checkin.js';
import { PhotoModel, type PhotoDoc } from '../models/photo.js';
import { PlaceModel } from '../models/place.js';
import { blockedEitherWay, findOrCreateUser, UserModel, type UserDoc } from '../models/user.js';

const FOLDER = 'photos';
const placeParamsSchema = z.object({ placeId: z.string() });
const userParamsSchema = z.object({ userId: z.string() });
const photoParamsSchema = z.object({ photoId: z.string() });
const unknownAuthor: CheckinAuthor = { id: '', displayName: 'Conta removida' };

function toPhotoDto(doc: PhotoDoc, place: { id: string; name: string }, author: CheckinAuthor, me: UserDoc): Photo {
  return {
    id: doc.id as string,
    place,
    url: `/media/${FOLDER}/${doc.file}`,
    caption: doc.caption || undefined,
    author,
    createdAt: doc.createdAt.toISOString(),
    mine: String(doc.userId) === String(me._id),
  };
}

/** Busca lugares e autores de uma vez e monta a lista de fotos. */
async function toPhotoList(docs: PhotoDoc[], me: UserDoc): Promise<Photo[]> {
  const [places, users] = await Promise.all([
    PlaceModel.find({ _id: { $in: docs.map((d) => d.placeId) } }, { name: 1 }),
    UserModel.find({ _id: { $in: docs.map((d) => d.userId) } }),
  ]);
  const placeById = new Map(places.map((p) => [p.id as string, { id: p.id as string, name: p.name }]));
  const authorById = new Map(users.map((u) => [u.id as string, toAuthorDto(u)]));
  return docs.map((d) =>
    toPhotoDto(
      d,
      placeById.get(String(d.placeId)) ?? { id: String(d.placeId), name: 'Lugar removido' },
      authorById.get(String(d.userId)) ?? unknownAuthor,
      me,
    ),
  );
}

async function listPhotos(filter: { placeId: string } | { userId: string }, query: unknown, me: UserDoc) {
  const { before, limit } = photosQuerySchema.parse(query);
  const blocked = [...(await blockedEitherWay(me))];
  const docs = await PhotoModel.find({ ...filter, $and: [{ userId: { $nin: blocked } }], ...(before ? { createdAt: { $lt: new Date(before) } } : {}) })
    .sort({ createdAt: -1 })
    .limit(limit);
  return { photos: await toPhotoList(docs, me) };
}

export const photoRoutes = (mediaDir: string): FastifyPluginAsync => async (app) => {
  await app.register(multipart, { limits: { fileSize: PHOTO_MAX_BYTES, files: 1, fields: 2 } });
  app.addHook('preHandler', app.requireAuth);

  /** Fotos postadas no lugar, das mais recentes para as mais antigas. */
  app.get('/places/:placeId/photos', async (req) => {
    const { placeId } = placeParamsSchema.parse(req.params);
    const me = await findOrCreateUser(req.identity!);
    if (!isValidObjectId(placeId)) return { photos: [] };
    return listPhotos({ placeId }, req.query, me);
  });

  /** Fotos do perfil de alguém. */
  app.get('/users/:userId/photos', async (req, reply) => {
    const { userId } = userParamsSchema.parse(req.params);
    const me = await findOrCreateUser(req.identity!);
    if (!isValidObjectId(userId) || !(await UserModel.exists({ _id: userId }))) {
      return reply.code(404).send({ error: 'Pessoa não encontrada' });
    }
    return listPhotos({ userId }, req.query, me);
  });

  /**
   * Posta uma foto do lugar (campo "file", JPEG/PNG/WebP; legenda opcional no campo "caption", antes do arquivo).
   * Só quem tem check-in no lugar: as fotos do perfil são de lugares onde a pessoa esteve.
   */
  app.post('/places/:placeId/photos', async (req, reply) => {
    const { placeId } = placeParamsSchema.parse(req.params);
    const place = isValidObjectId(placeId) ? await PlaceModel.findById(placeId) : null;
    if (!place) return reply.code(404).send({ error: 'Lugar não encontrado' });

    const me = await findOrCreateUser(req.identity!);
    const present = await CheckinModel.exists({ userId: me._id, placeId: place._id, presenceUntil: { $gt: new Date() } });
    if (!present) return reply.code(422).send({ error: 'Faça check-in no lugar para postar fotos dele' });

    if (!req.isMultipart()) return reply.code(400).send({ error: 'Envie a foto como multipart/form-data' });
    const part = await req.file();
    if (!part) return reply.code(400).send({ error: 'Envie a foto no campo "file"' });
    const captionField = part.fields.caption;
    const rawCaption = captionField && !Array.isArray(captionField) && captionField.type === 'field' ? captionField.value : undefined;
    const caption = photoCaptionSchema.parse(typeof rawCaption === 'string' ? rawCaption : undefined);

    const data = await part.toBuffer().catch((err: { code?: string }) => {
      if (err.code === 'FST_REQ_FILE_TOO_LARGE') return null;
      throw err;
    });
    if (!data) return reply.code(413).send({ error: `A foto pode ter no máximo ${PHOTO_MAX_BYTES / 1024 / 1024} MB` });

    const type = detectFileType(data);
    if (type?.kind !== 'image') return reply.code(415).send({ error: 'Envie uma foto JPEG, PNG ou WebP' });

    const file = await saveMedia(mediaDir, FOLDER, data, type.ext);
    const doc = await PhotoModel.create({ placeId: place._id, userId: me._id, file, caption: caption || undefined, size: data.length });
    return reply.code(201).send(toPhotoDto(doc, { id: place.id as string, name: place.name }, toAuthorDto(me), me));
  });

  /** Quem postou apaga a foto (e o arquivo do disco). */
  app.delete('/photos/:photoId', async (req, reply) => {
    const { photoId } = photoParamsSchema.parse(req.params);
    const me = await findOrCreateUser(req.identity!);
    const doc = isValidObjectId(photoId) ? await PhotoModel.findById(photoId) : null;
    if (!doc) return reply.code(404).send({ error: 'Foto não encontrada' });
    if (String(doc.userId) !== String(me._id)) return reply.code(403).send({ error: 'Só quem postou pode apagar a foto' });
    await doc.deleteOne();
    await deleteMedia(mediaDir, FOLDER, doc.file);
    return reply.code(204).send();
  });
};
