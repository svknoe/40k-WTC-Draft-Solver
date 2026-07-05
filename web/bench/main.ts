/**
 * Benchmark harness for the issue #17 spike. Drives the real §3 worker
 * (web/src/worker/worker.ts) over the Scotland conformance fixture at
 * k=3 / k=4 / exact, measuring wall time per phase and peak worker JS heap
 * (sampled inside the worker; Chrome-only), and validating each root value
 * against the Python engine's fixture value.
 */

import { fixtureMatrix, scotland } from '../src/conformance/fixtures';
import { SolveStats } from '../src/worker/worker';
import { SolvedEvent, WorkerRequest, WorkerResponse } from '../src/engine/types';

type BenchSolved = SolvedEvent & { stats?: SolveStats };

interface RunResult {
  config: string;
  k: number | null;
  totalS: number;
  enumerateS: number;
  inductS: number;
  /** performance.measureUserAgentSpecificMemory bytes attributed to the
   * worker realm (needs cross-origin isolation; Chrome-only), polled
   * continuously DURING the solve — the real measured peak. */
  workerHeapPeakMB: number | null;
  /** Same measurement taken once after 'solved' while the worker still holds
   * the engine — what a real app would keep holding. */
  workerHeapRetainedMB: number | null;
  /** Exact engine accounting: peak of stored key/value arrays + transient
   * enumeration buffers (a floor — excludes V8/GC overhead). */
  enginePeakAllocMB: number;
  engineArraysMB: number;
  value: number;
  expectedValue: number;
  valueMatches: boolean;
}

const VALUE_TOLERANCE = 1e-9;

const progressBar = document.querySelector<HTMLDivElement>('#progress > div')!;
const statusLine = document.querySelector<HTMLDivElement>('#status')!;
const table = document.querySelector<HTMLTableElement>('#results')!;
const tableBody = table.querySelector('tbody')!;
const summary = document.querySelector<HTMLPreElement>('#summary')!;
const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));

const results: RunResult[] = [];

function expectedValueFor(k: number | null): number {
  const solve = scotland.solves.find((s) => s.k === k);
  if (!solve) throw new Error(`No fixture solve for k=${k}`);
  return solve.expectedValue;
}

interface MemoryBreakdownEntry {
  bytes: number;
  types: string[];
  attribution?: { url?: string; scope?: string }[];
}

/** Bytes attributed to worker realms by measureUserAgentSpecificMemory
 * (Chrome, cross-origin isolated contexts only — see vite.config.ts). */
async function measureWorkerBytes(): Promise<number | null> {
  const measure = (performance as unknown as {
    measureUserAgentSpecificMemory?: () => Promise<{ breakdown: MemoryBreakdownEntry[] }>;
  }).measureUserAgentSpecificMemory;
  if (!measure || !crossOriginIsolated) return null;
  try {
    const result = await measure.call(performance);
    let bytes = 0;
    for (const entry of result.breakdown) {
      const attributedToWorker = entry.attribution?.some((a) =>
        (a.scope ?? '').includes('Worker') || (a.url ?? '').includes('worker')) ?? false;
      if (attributedToWorker || entry.types.some((t) => t.toLowerCase().includes('worker'))) {
        bytes += entry.bytes;
      }
    }
    return bytes;
  } catch {
    return null;
  }
}

async function runConfig(k: number | null): Promise<RunResult> {
  const configName = k === null ? 'exact' : `k=${k}`;
  // A fresh worker per run: clean heap baseline, no cross-run JIT or GC state.
  const worker = new Worker(new URL('../src/worker/worker.ts', import.meta.url), { type: 'module' });

  // Poll the precise-memory API for the whole solve; each call resolves when
  // the browser gets around to it, so just chain them back to back.
  let polling = true;
  let workerHeapPeak: number | null = null;
  const poller = (async () => {
    while (polling) {
      const bytes = await measureWorkerBytes();
      if (bytes === null) return;
      if (workerHeapPeak === null || bytes > workerHeapPeak) workerHeapPeak = bytes;
      await new Promise((r) => setTimeout(r, 50));
    }
  })();

  try {
    const { message, totalMs } = await new Promise<{ message: BenchSolved; totalMs: number }>(
      (resolve, reject) => {
        const started = performance.now();
        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          const msg = event.data;
          if (msg.type === 'progress') {
            progressBar.style.width = `${(msg.frac * 100).toFixed(1)}%`;
            statusLine.textContent = `${configName}: ${msg.phase} ${(msg.frac * 100).toFixed(0)}%`;
          } else if (msg.type === 'solved') {
            resolve({ message: msg as BenchSolved, totalMs: performance.now() - started });
          } else if (msg.type === 'error') {
            reject(new Error(`${msg.code}: ${msg.message}`));
          }
        };
        worker.onerror = (event) => reject(new Error(event.message));

        const request: WorkerRequest = {
          type: 'solve', reqId: 1, protocol: 1,
          matrix: fixtureMatrix(scotland), k,
        };
        worker.postMessage(request);
      });

    polling = false;
    await poller;
    // One more measurement while the worker still holds the solved engine.
    const retainedBytes = await measureWorkerBytes();
    if (retainedBytes !== null && (workerHeapPeak === null || retainedBytes > workerHeapPeak)) {
      workerHeapPeak = retainedBytes;
    }

    const stats = message.stats;
    const expected = expectedValueFor(k);
    return {
      config: configName,
      k,
      totalS: (stats?.totalMs ?? totalMs) / 1000,
      enumerateS: (stats?.enumerateMs ?? 0) / 1000,
      inductS: (stats?.inductMs ?? 0) / 1000,
      workerHeapPeakMB: workerHeapPeak !== null ? workerHeapPeak / 2 ** 20 : null,
      workerHeapRetainedMB: retainedBytes !== null ? retainedBytes / 2 ** 20 : null,
      enginePeakAllocMB: (stats?.peakAllocBytes ?? 0) / 2 ** 20,
      engineArraysMB: (stats?.storedBytes ?? 0) / 2 ** 20,
      value: message.expected,
      expectedValue: expected,
      valueMatches: Math.abs(message.expected - expected) < VALUE_TOLERANCE,
    };
  } finally {
    polling = false;
    worker.terminate();
  }
}

function render(): void {
  table.hidden = false;
  summary.hidden = false;
  tableBody.innerHTML = '';
  for (const r of results) {
    const row = document.createElement('tr');
    const cells = [
      r.config,
      r.totalS.toFixed(2),
      r.enumerateS.toFixed(2),
      r.inductS.toFixed(2),
      r.workerHeapPeakMB === null ? 'n/a' : r.workerHeapPeakMB.toFixed(0),
      r.workerHeapRetainedMB === null ? 'n/a' : r.workerHeapRetainedMB.toFixed(0),
      r.enginePeakAllocMB.toFixed(1),
      r.engineArraysMB.toFixed(1),
      r.value.toFixed(12),
      r.valueMatches ? '✓ matches' : `✗ expected ${r.expectedValue.toFixed(12)}`,
    ];
    cells.forEach((text, index) => {
      const cell = document.createElement('td');
      cell.textContent = text;
      if (index === cells.length - 1) cell.className = r.valueMatches ? 'ok' : 'fail';
      row.appendChild(cell);
    });
    tableBody.appendChild(row);
  }
  summary.textContent = JSON.stringify({ done: results.length, results }, null, 2);
}

async function run(ks: (number | null)[]): Promise<void> {
  buttons.forEach((b) => (b.disabled = true));
  try {
    for (const k of ks) {
      statusLine.textContent = `${k === null ? 'exact' : `k=${k}`}: starting worker...`;
      progressBar.style.width = '0%';
      results.push(await runConfig(k));
      render();
    }
    statusLine.textContent = 'Done.';
  } catch (error) {
    statusLine.textContent = `FAILED: ${error instanceof Error ? error.message : String(error)}`;
    statusLine.className = 'fail';
    throw error;
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

for (const button of buttons) {
  const kAttr = button.dataset.k;
  if (kAttr !== undefined) {
    button.addEventListener('click', () => run([kAttr === 'exact' ? null : Number(kAttr)]));
  }
}
document.querySelector('#run-all')!.addEventListener('click', () => run([3, 4, null]));

if (new URLSearchParams(location.search).get('auto') === '1') {
  run([3, 4, null]);
}
