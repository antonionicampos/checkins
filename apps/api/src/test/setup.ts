import { buildApp } from '../app.js';

export const TEST_MONGO_URL = process.env.MONGO_URL_TEST;

export function buildTestApp() {
  return buildApp({ CORS_ORIGIN: '*', LOG_LEVEL: 'silent' });
}
