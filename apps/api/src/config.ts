import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().default(3000),
  MONGO_URL: z.string().default('mongodb://localhost:27017/checkins'),
  /** Origens liberadas no CORS, separadas por vírgula. "*" libera todas (só para desenvolvimento). */
  CORS_ORIGIN: z.string().default('*'),
  /** ID do projeto no Firebase; a API usa só para validar os tokens de login. */
  FIREBASE_PROJECT_ID: z.string().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return envSchema.parse(env);
}
