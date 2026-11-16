import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Klient (obrazovka + ovladač) leží ve složce client/. Dvě HTML stránky = dva vstupy.
export default defineConfig({
  root: 'client',
  appType: 'mpa',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        screen: resolve(__dirname, 'client/index.html'),
        controller: resolve(__dirname, 'client/controller.html'),
      },
    },
  },
});
