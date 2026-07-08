import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5199,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
});
