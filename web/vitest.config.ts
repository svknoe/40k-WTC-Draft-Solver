import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// A standalone Vitest config (not merged with vite.config.ts): tests need the
// React JSX transform but NOT the COOP/COEP middleware or the multi-page build.
// The default environment is node, so the existing engine/conformance/bench
// suites run exactly as before; component tests opt into jsdom with a per-file
// `// @vitest-environment jsdom` docblock.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    // RTL's auto-cleanup was not registering reliably under `globals`, leaking
    // component renders into later tests as duplicate elements. Register an
    // explicit afterEach(cleanup) via the setup file instead.
    setupFiles: ['./vitest.setup.ts'],
  },
});
