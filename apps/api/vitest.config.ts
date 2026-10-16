import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Os testes de rotas compartilham o mesmo banco de teste.
    fileParallelism: false,
  },
});
