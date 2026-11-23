import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    testTimeout: 60000,
    hookTimeout: 60000,
    pool: 'forks',
    include: ['tests/**/*.test.js']
  },
  resolve: { alias: { '@': path.resolve('.') } }
});
