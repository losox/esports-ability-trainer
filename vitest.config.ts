import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/i18n/**'],
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/', import.meta.url)),
      '@modules': fileURLToPath(new URL('./src/modules/', import.meta.url)),
      '@components': fileURLToPath(new URL('./src/components/', import.meta.url)),
      '@layouts': fileURLToPath(new URL('./src/layouts/', import.meta.url)),
      '@i18n': fileURLToPath(new URL('./src/i18n/', import.meta.url)),
    },
  },
});
