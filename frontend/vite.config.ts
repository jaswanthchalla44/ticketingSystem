/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.VITE_DEV_API_TARGET ?? 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // amazon-cognito-identity-js uses Node's `global` (through buffer). Browsers have none, so the dev page crashes without this.
  define: { global: 'globalThis' },
  server: {
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // The auth tests cover the local preview sign-in, so the suite runs in local mode. config.test.ts covers the Cognito default.
    env: { VITE_AUTH_MODE: 'local' },
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
