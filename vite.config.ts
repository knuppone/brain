import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  base: './',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1500 },
  server: { watch: { ignored: [`${root}.claude/**`, `${root}.sources/**`] } },
  test: { include: ['tests/**/*.test.ts'] },
});
