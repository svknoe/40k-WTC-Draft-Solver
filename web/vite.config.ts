import { defineConfig, PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Cross-origin isolation unlocks performance.measureUserAgentSpecificMemory in
// the benchmark harness (per-realm heap attribution incl. the engine worker).
// Everything served is same-origin, so this costs nothing. A middleware plugin
// rather than server.headers: the latter is not applied to transform-served
// module requests (e.g. the worker script), which COEP then blocks. (GitHub
// Pages can't set these headers, so the bench's memory column reads n/a there;
// the worker itself needs no isolation, so the app is unaffected.)
function crossOriginIsolation(): PluginOption {
  return {
    name: 'cross-origin-isolation',
    configureServer(server) {
      server.middlewares.use((_request, response, next) => {
        response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        next();
      });
    },
  };
}

// base: the app ships at the GitHub Pages project-site path (docs/web-design.md
// §9); dev stays at '/' so the preview tooling addresses it simply. Two HTML
// entries: the React app (index.html) and the relocated #17 benchmark
// (bench.html), which stays functional as a sub-page.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/40k-WTC-Draft-Solver/' : '/',
  plugins: [react(), crossOriginIsolation()],
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        bench: resolve(__dirname, 'bench.html'),
      },
    },
  },
}));
