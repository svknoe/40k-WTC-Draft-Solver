import { describe, expect, test } from 'vitest';
import type { Matrix, NodeResult, WorkerRequest, WorkerResponse } from '../engine/types';
import { WorkerClient, WorkerLike } from './client';

const node: NodeResult = { stage: 'defender', side: 'simultaneous', round: 1, choices: [], why: null };

const matrix: Matrix = {
  n: 4,
  myNames: ['a', 'b', 'c', 'd'],
  enemyNames: ['w', 'x', 'y', 'z'],
  cells: Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => ({ best: 0, worst: 0 }))),
};

/** A fake worker whose postMessage synchronously runs a responder that can push
 * messages back through onmessage — stands in for the real engine worker. */
class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  terminated = false;
  constructor(private readonly responder: (msg: WorkerRequest, post: (m: WorkerResponse) => void) => void) {}
  postMessage(message: WorkerRequest): void {
    this.responder(message, (m) => this.onmessage?.({ data: m } as MessageEvent<WorkerResponse>));
  }
  terminate(): void {
    this.terminated = true;
  }
}

describe('WorkerClient', () => {
  test('solve forwards progress events and resolves on solved', async () => {
    const worker = new FakeWorker((msg, post) => {
      post({ type: 'progress', reqId: msg.reqId, frac: 0.5, phase: 'enumerating' });
      post({ type: 'solved', reqId: msg.reqId, expected: 3.25, root: node });
    });
    const client = new WorkerClient(worker);
    const progress: number[] = [];
    const solved = await client.solve(matrix, null, (e) => progress.push(e.frac));
    expect(progress).toEqual([0.5]);
    expect(solved.expected).toBe(3.25);
    expect(solved.root).toBe(node);
  });

  test('node resolves the NodeResult', async () => {
    const worker = new FakeWorker((msg, post) => {
      if (msg.type === 'node') post({ type: 'nodeResult', reqId: msg.reqId, node });
    });
    const client = new WorkerClient(worker);
    expect(await client.node([])).toBe(node);
  });

  test('reset resolves on reset-ok', async () => {
    const worker = new FakeWorker((msg, post) => post({ type: 'reset-ok', reqId: msg.reqId }));
    const client = new WorkerClient(worker);
    await expect(client.reset()).resolves.toBeUndefined();
  });

  test('an error message rejects with "code: message"', async () => {
    const worker = new FakeWorker((msg, post) =>
      post({ type: 'error', reqId: msg.reqId, code: 'not-solved', message: 'send solve first' }));
    const client = new WorkerClient(worker);
    await expect(client.node([])).rejects.toThrow('not-solved: send solve first');
  });

  test('correlates responses by reqId across concurrent requests', async () => {
    const worker = new FakeWorker((msg, post) => {
      if (msg.type === 'solve') post({ type: 'solved', reqId: msg.reqId, expected: msg.reqId, root: node });
    });
    const client = new WorkerClient(worker);
    const [a, b] = await Promise.all([client.solve(matrix, null), client.solve(matrix, 3)]);
    expect(a.expected).toBe(1);
    expect(b.expected).toBe(2);
  });

  test('terminate stops the worker', () => {
    const worker = new FakeWorker(() => {});
    new WorkerClient(worker).terminate();
    expect(worker.terminated).toBe(true);
  });
});
