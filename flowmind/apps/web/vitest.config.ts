import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Match the app's `@/*` path alias.
      '@': resolve(__dirname, '.'),
      // `server-only` throws outside a React Server bundler context; stub it so
      // server modules can be unit-tested directly in Node.
      'server-only': resolve(__dirname, 'test/setup/empty.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globals: true,
  },
});
