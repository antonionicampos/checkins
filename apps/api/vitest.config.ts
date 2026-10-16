import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Lê o .env da raiz (MONGO_URL_TEST); variáveis já definidas no ambiente têm prioridade.
    env: { ...loadEnv('test', '../../', ''), ...process.env },
    // Os testes de rotas compartilham o mesmo banco de teste.
    fileParallelism: false,
  },
});
