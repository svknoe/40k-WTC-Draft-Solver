// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import type { NodeResult, WorkerRequest, WorkerResponse } from '../engine/types';
import type { EditorMatrix } from '../model/matrix';
import { WorkerClient, WorkerLike } from './client';
import { useSolve } from './useSolve';

const rootNode: NodeResult = { stage: 'defender', side: 'simultaneous', round: 1, choices: [], why: null };

function editor4(): EditorMatrix {
  return {
    n: 4,
    myTeam: 'A',
    enemyTeam: 'B',
    myNames: ['a', 'b', 'c', 'd'],
    enemyNames: ['w', 'x', 'y', 'z'],
    cells: Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => ({ b: '12', w: '9' }))),
  };
}

class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  constructor(private readonly responder: (msg: WorkerRequest, post: (m: WorkerResponse) => void) => void) {}
  postMessage(message: WorkerRequest): void {
    this.responder(message, (m) => this.onmessage?.({ data: m } as MessageEvent<WorkerResponse>));
  }
  terminate(): void {}
}

function factory(responder: (msg: WorkerRequest, post: (m: WorkerResponse) => void) => void) {
  return () => new WorkerClient(new FakeWorker(responder));
}

describe('useSolve', () => {
  test('forwards progress and resolves to the solved result', async () => {
    const { result } = renderHook(() =>
      useSolve(factory((msg, post) => {
        post({ type: 'progress', reqId: msg.reqId, frac: 0.5, phase: 'inducting' });
        post({ type: 'solved', reqId: msg.reqId, expected: 4.5, root: rootNode });
      })));

    act(() => result.current.solve(editor4(), null));
    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(result.current.result?.expected).toBe(4.5);
    expect(result.current.progress).toBe(1);
  });

  test('surfaces an engine error', async () => {
    const { result } = renderHook(() =>
      useSolve(factory((msg, post) =>
        post({ type: 'error', reqId: msg.reqId, code: 'engine-error', message: 'boom' }))));

    act(() => result.current.solve(editor4(), 3));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toMatch(/boom/);
  });

  test('reset clears the result', async () => {
    const { result } = renderHook(() =>
      useSolve(factory((msg, post) => post({ type: 'solved', reqId: msg.reqId, expected: 1, root: rootNode }))));

    act(() => result.current.solve(editor4(), null));
    await waitFor(() => expect(result.current.status).toBe('done'));
    act(() => result.current.reset());
    expect(result.current.status).toBe('idle');
    expect(result.current.result).toBeNull();
  });
});
