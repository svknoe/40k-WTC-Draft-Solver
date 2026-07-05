import { defineConfig, PluginOption } from 'vite';

// Cross-origin isolation unlocks performance.measureUserAgentSpecificMemory in
// the benchmark harness (per-realm heap attribution incl. the engine worker).
// Everything served is same-origin, so this costs nothing. A middleware plugin
// rather than server.headers: the latter is not applied to transform-served
// module requests (e.g. the worker script), which COEP then blocks.
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

export default defineConfig({
  plugins: [crossOriginIsolation()],
});
