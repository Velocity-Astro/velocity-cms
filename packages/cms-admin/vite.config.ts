import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Only for the development preview. The package itself is built with `tsc -b` from the repo root.
export default defineConfig({ plugins: [react(), tailwindcss()] });
