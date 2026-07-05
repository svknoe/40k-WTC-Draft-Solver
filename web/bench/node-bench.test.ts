/**
 * Node-side memory/time benchmark (issue #17), env-gated out of the normal
 * test run: RUN_NODE_BENCH=1 npx vitest run bench/node-bench.test.ts
 *
 * Complements the in-browser harness (bench/main.ts): the embedded preview
 * browser blocks both performance.memory in workers and
 * performance.measureUserAgentSpecificMemory, so real V8 heap numbers for the
 * engine are taken here instead — same engine, same V8, sampled via
 * process.memoryUsage() inside the progress callback (the solve is
 * synchronous, so sampling must happen on the solving thread).
 */

import { test } from 'vitest';
import { DraftEngine } from '../src/engine/engine';
import { fixtureMatrix, scotland } from '../src/conformance/fixtures';

const RUN = process.env.RUN_NODE_BENCH === '1';

test.skipIf(!RUN)('node bench: Scotland k=3 / k=4 / exact', { timeout: 600_000 }, () => {
  const results = [];
  for (const k of [3, 4, null]) {
    if (globalThis.gc) globalThis.gc();
    const baseline = process.memoryUsage();
    let peakHeap = baseline.heapUsed;
    let peakRss = baseline.rss;

    const engine = new DraftEngine(fixtureMatrix(scotland), k);
    const started = performance.now();
    const value = engine.solve(() => {
      const usage = process.memoryUsage();
      if (usage.heapUsed > peakHeap) peakHeap = usage.heapUsed;
      if (usage.rss > peakRss) peakRss = usage.rss;
    });
    const totalS = (performance.now() - started) / 1000;

    const after = process.memoryUsage();
    if (after.heapUsed > peakHeap) peakHeap = after.heapUsed;
    if (after.rss > peakRss) peakRss = after.rss;

    results.push({
      config: k === null ? 'exact' : `k=${k}`,
      totalS: Number(totalS.toFixed(3)),
      value,
      baselineHeapMB: Number((baseline.heapUsed / 2 ** 20).toFixed(1)),
      peakHeapMB: Number((peakHeap / 2 ** 20).toFixed(1)),
      heapDeltaMB: Number(((peakHeap - baseline.heapUsed) / 2 ** 20).toFixed(1)),
      peakRssMB: Number((peakRss / 2 ** 20).toFixed(1)),
      enginePeakAllocMB: Number((engine.peakAllocBytes() / 2 ** 20).toFixed(1)),
      engineArraysMB: Number((engine.storedBytes() / 2 ** 20).toFixed(1)),
    });
  }
  console.log('NODE_BENCH_RESULTS ' + JSON.stringify(results, null, 2));
});
