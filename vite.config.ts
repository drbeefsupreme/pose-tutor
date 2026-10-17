import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = import.meta.dirname;

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: { input: { index: resolve(root, 'index.html'), gate: resolve(root, 'gate.html') } },
    chunkSizeWarningLimit: 1500,
  },
});
