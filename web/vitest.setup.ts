import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Unmount React trees between tests. @testing-library/react's auto-cleanup does
// not reliably register under our Vitest `globals` config (component renders
// were leaking into later tests as duplicate elements), so register it
// explicitly. cleanup() is a no-op in the node-environment engine/conformance
// suites (nothing is mounted there).
afterEach(() => {
  cleanup();
});
