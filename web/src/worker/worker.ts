/**
 * The engine web worker — implements the §3 message protocol
 * (docs/web-design.md): solve (long-running, emits progress), node (instant,
 * served from the solved values held in memory), reset. All messages are
 * plain structured-clone-able objects with a reqId; the UI framework never
 * sees the engine directly.
 *
 * Spike instrumentation (issue #17): the 'solved' message carries an extra
 * optional `stats` block (per-phase times, JS heap samples taken inside the
 * worker) consumed by the benchmark harness. A UI that only knows §3 can
 * ignore it.
 */

import { DraftEngine } from '../engine/engine';
import { SolvedEvent, WorkerRequest, WorkerResponse } from '../engine/types';

export interface SolveStats {
  enumerateMs: number;
  inductMs: number;
  totalMs: number;
  /** Engine key/value arrays held after the solve (a floor for real usage). */
  storedBytes: number;
  /** Peak of stored + transient enumeration buffers (exact engine
   * accounting; excludes V8 object/GC overhead). */
  peakAllocBytes: number;
  /** performance.memory.usedJSHeapSize samples — null where the API is not
   * exposed to workers (most browsers); the bench measures from the page via
   * performance.measureUserAgentSpecificMemory instead. */
  baselineHeapBytes: number | null;
  peakHeapBytes: number | null;
}

type BenchSolvedEvent = SolvedEvent & { stats: SolveStats };

let engine: DraftEngine | null = null;

function post(message: WorkerResponse | BenchSolvedEvent): void {
  (self as unknown as Worker).postMessage(message);
}

function usedHeap(): number | null {
  const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return memory ? memory.usedJSHeapSize : null;
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  try {
    if (request.type === 'solve') {
      engine = new DraftEngine(request.matrix, request.k, request.neutralWeight ?? 0.5);

      const started = performance.now();
      let enumerateMs = 0;
      let peakHeapBytes = usedHeap();
      const baselineHeapBytes = peakHeapBytes;
      let lastReport = 0;

      const expected = engine.solve((frac, phase) => {
        if (phase === 'inducting' && enumerateMs === 0) {
          enumerateMs = performance.now() - started;
        }
        const heap = usedHeap();
        if (heap !== null && (peakHeapBytes === null || heap > peakHeapBytes)) {
          peakHeapBytes = heap;
        }
        // Throttle progress messages to ~50/s; the induction loop already
        // reports only every ~16k games.
        const now = performance.now();
        if (now - lastReport >= 20 || frac >= 1) {
          lastReport = now;
          post({ type: 'progress', reqId: request.reqId, frac, phase });
        }
      });

      const totalMs = performance.now() - started;
      const finalHeap = usedHeap();
      if (finalHeap !== null && (peakHeapBytes === null || finalHeap > peakHeapBytes)) {
        peakHeapBytes = finalHeap;
      }

      post({
        type: 'solved',
        reqId: request.reqId,
        expected,
        root: engine.nodeResult([]),
        stats: {
          enumerateMs,
          inductMs: totalMs - enumerateMs,
          totalMs,
          storedBytes: engine.storedBytes(),
          peakAllocBytes: engine.peakAllocBytes(),
          baselineHeapBytes,
          peakHeapBytes,
        },
      });
    } else if (request.type === 'node') {
      if (engine === null || !engine.isSolved()) {
        post({
          type: 'error', reqId: request.reqId, code: 'not-solved',
          message: 'No solved matrix in the worker; send a solve request first.',
        });
        return;
      }
      post({ type: 'nodeResult', reqId: request.reqId, node: engine.nodeResult(request.path) });
    } else if (request.type === 'reset') {
      engine = null;
      post({ type: 'reset-ok', reqId: request.reqId });
    } else {
      post({
        type: 'error', reqId: (request as { reqId: number }).reqId ?? -1,
        code: 'unknown-request',
        message: `Unknown request type: ${(request as { type: string }).type}`,
      });
    }
  } catch (error) {
    post({
      type: 'error', reqId: request.reqId, code: 'engine-error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
