import type {
  Matrix,
  Move,
  NodeResult,
  NodeResultEvent,
  ProgressEvent,
  ResetOkEvent,
  SolvedEvent,
  WorkerRequest,
  WorkerResponse,
} from '../engine/types';

/** The minimal Worker surface the client uses. The real `Worker` satisfies it
 * structurally; tests inject a fake so no worker is bundled in the unit run. */
export interface WorkerLike {
  postMessage(message: WorkerRequest): void;
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((event: unknown) => void) | null;
  terminate(): void;
}

interface Pending {
  resolve: (value: WorkerResponse) => void;
  reject: (error: Error) => void;
  onProgress?: (event: ProgressEvent) => void;
}

/** UI-thread client for the §3 worker protocol (docs/web-design.md): correlates
 * responses to requests by reqId, forwards progress events, and turns each
 * request into a promise. The UI framework never touches the engine directly. */
export class WorkerClient {
  private readonly worker: WorkerLike;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(worker?: WorkerLike) {
    this.worker =
      worker ??
      (new Worker(new URL('../worker/worker.ts', import.meta.url), { type: 'module' }) as WorkerLike);
    this.worker.onmessage = (event) => this.handle(event.data);
    this.worker.onerror = (event) => this.failAll(event);
  }

  private handle(message: WorkerResponse): void {
    if (message.type === 'progress') {
      this.pending.get(message.reqId)?.onProgress?.(message);
      return;
    }
    const entry = this.pending.get(message.reqId);
    if (!entry) return;
    this.pending.delete(message.reqId);
    if (message.type === 'error') {
      entry.reject(new Error(`${message.code}: ${message.message}`));
    } else {
      entry.resolve(message);
    }
  }

  private failAll(event: unknown): void {
    const detail = (event as { message?: string })?.message ?? String(event);
    const error = new Error(`Engine worker crashed: ${detail}`);
    for (const entry of this.pending.values()) entry.reject(error);
    this.pending.clear();
  }

  private send<T extends WorkerResponse>(
    build: (reqId: number) => WorkerRequest,
    onProgress?: (event: ProgressEvent) => void,
  ): Promise<T> {
    const reqId = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(reqId, {
        resolve: resolve as (value: WorkerResponse) => void,
        reject,
        onProgress,
      });
      this.worker.postMessage(build(reqId));
    });
  }

  /** Run the full solve; `onProgress` receives real progress events. */
  solve(matrix: Matrix, k: number | null, onProgress?: (event: ProgressEvent) => void): Promise<SolvedEvent> {
    return this.send<SolvedEvent>((reqId) => ({ type: 'solve', reqId, protocol: 1, matrix, k }), onProgress);
  }

  /** Query one draft node (instant, served from the solved values). */
  async node(path: Move[]): Promise<NodeResult> {
    const result = await this.send<NodeResultEvent>((reqId) => ({ type: 'node', reqId, path }));
    return result.node;
  }

  /** Discard the solved state (matrix edited → results invalid). */
  async reset(): Promise<void> {
    await this.send<ResetOkEvent>((reqId) => ({ type: 'reset', reqId }));
  }

  terminate(): void {
    this.worker.terminate();
  }
}
