import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1500 },
  server: { watch: { ignored: ['**/.claude/**', '**/.sources/**'] } },
  test: { include: ['tests/**/*.test.ts'] },
});
