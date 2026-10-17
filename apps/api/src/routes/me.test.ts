import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectMongo, disconnectMongo } from '../db.js';
import { UserModel } from '../models/user.js';
import { authHeader, buildTestApp, TEST_MONGO_URL } from '../test/setup.js';

describe('/me sem login', async () => {
  const app = await buildTestApp();
  afterAll(() => app.close());

  it('responde 401 sem token', async () => {
    const res = await app.inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).toBe(401);
  });

  it('responde 401 com token inválido', async () => {
    const res = await app.inject({ method: 'GET', url: '/me', headers: { authorization: 'Bearer lixo' } });
    expect(res.statusCode).toBe(401);
  });
});

describe.skipIf(!TEST_MONGO_URL)('/me com login', async () => {
  const app = await buildTestApp();

  beforeAll(async () => {
    await connectMongo(TEST_MONGO_URL!);
    await UserModel.deleteMany({});
    await UserModel.syncIndexes();
  });

  afterAll(async () => {
    await app.close();
    await disconnectMongo();
  });

  it('cria o perfil no primeiro acesso e reaproveita depois', async () => {
    const first = await app.inject({ method: 'GET', url: '/me', headers: authHeader('ana') });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ displayName: 'ana', email: 'ana@exemplo.com' });

    const second = await app.inject({ method: 'GET', url: '/me', headers: authHeader('ana') });
    expect(second.json().id).toBe(first.json().id);
    expect(await UserModel.countDocuments({ firebaseUid: 'ana' })).toBe(1);
  });

  it('muda o nome exibido', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/me',
      headers: authHeader('ana'),
      payload: { displayName: 'Ana Souza' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().displayName).toBe('Ana Souza');
  });

  it('muda o "sobre mim" sem mexer no nome e apaga com texto vazio', async () => {
    const set = await app.inject({ method: 'PATCH', url: '/me', headers: authHeader('ana'), payload: { bio: ' Gosto de bar ' } });
    expect(set.json()).toMatchObject({ displayName: 'Ana Souza', bio: 'Gosto de bar' });
    const cleared = await app.inject({ method: 'PATCH', url: '/me', headers: authHeader('ana'), payload: { bio: '' } });
    expect(cleared.json().bio).toBeUndefined();
    const long = await app.inject({ method: 'PATCH', url: '/me', headers: authHeader('ana'), payload: { bio: 'x'.repeat(161) } });
    expect(long.statusCode).toBe(400);
  });

  it('recusa nome curto demais', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/me',
      headers: authHeader('ana'),
      payload: { displayName: 'A' },
    });
    expect(res.statusCode).toBe(400);
  });
});
