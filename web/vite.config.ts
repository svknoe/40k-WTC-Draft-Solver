import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: the app ships at the GitHub Pages project-site path (docs/web-design.md
// §9); dev stays at '/' so the preview tooling addresses it simply.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/40k-WTC-Draft-Solver/' : '/',
  plugins: [react()],
}));
