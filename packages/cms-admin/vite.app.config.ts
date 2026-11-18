import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Builds the editor into `app-dist/`, ready for a site to serve. Addresses inside the files are
 * relative, and the server adds a `<base>` for wherever the editor is mounted.
 */
export default defineConfig({
  root: 'standalone',
  base: './',
  plugins: [react(), tailwindcss()],
  // The rich text editor is its own file (about 410 kB), fetched when an entry has such a field.
  // The rest is one file of about 1,050 kB for now. Splitting it by screen is planned work, so
  // the warning is set just above today's size: it will speak up if the editor grows.
  build: { outDir: '../app-dist', emptyOutDir: true, sourcemap: false, target: 'es2022', chunkSizeWarningLimit: 1100 },
});
