import { defineConfig } from 'vite';

// Use relative asset paths so the build works at any deploy subpath
// (e.g. GitHub Pages serves this at https://<user>.github.io/woof/).
export default defineConfig({
  base: './',
  server: { host: true, port: 5173, open: false },
  build: { target: 'es2022' },
});
