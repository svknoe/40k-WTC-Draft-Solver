import { useRef, useState } from 'react';
import type { Move, NodeResult, SolvedEvent } from '../engine/types';
import type { EditorMatrix } from '../model/matrix';
import { toEngineMatrix } from '../model/matrix';
import { WorkerClient } from './client';

export type SolveStatus = 'idle' | 'solving' | 'done' | 'error';

export interface SolveState {
  status: SolveStatus;
  progress: number;
  phase: 'enumerating' | 'inducting' | null;
  result: SolvedEvent | null;
  error: string | null;
  /** The k of the completed solve (null = exact); undefined before any solve. */
  solvedK: number | null | undefined;
  /** k = null → exact; k = 3 → fast preview (§7). */
  solve: (matrix: EditorMatrix, k: number | null) => void;
  /** Query one draft node from the solved values (instant). The trainer uses
   * this; it rejects if nothing is solved. */
  node: (path: Move[]) => Promise<NodeResult>;
  reset: () => void;
}

/** Owns one engine WorkerClient for the tab's lifetime and drives the §3 solve
 * request, surfacing real progress. `makeClient` is injectable for tests. */
export function useSolve(makeClient: () => WorkerClient = () => new WorkerClient()): SolveState {
  const clientRef = useRef<WorkerClient | null>(null);
  // Generation token: bumped on every solve() and reset(). A worker request
  // can't be cancelled once posted (the engine runs synchronously), so a solve
  // that resolves after a reset/newer solve is stale and must be ignored —
  // otherwise editing the matrix mid-solve would land an out-of-date result.
  const genRef = useRef(0);
  const [status, setStatus] = useState<SolveStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<'enumerating' | 'inducting' | null>(null);
  const [result, setResult] = useState<SolvedEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [solvedK, setSolvedK] = useState<number | null | undefined>(undefined);

  const client = () => {
    if (!clientRef.current) clientRef.current = makeClient();
    return clientRef.current;
  };

  const solve = (matrix: EditorMatrix, k: number | null) => {
    let engineMatrix;
    try {
      engineMatrix = toEngineMatrix(matrix);
    } catch (e) {
      setStatus('error');
      setError((e as Error).message);
      return;
    }
    const gen = ++genRef.current;
    setStatus('solving');
    setProgress(0);
    setPhase(null);
    setError(null);
    setResult(null);
    client()
      .solve(engineMatrix, k, (event) => {
        if (gen !== genRef.current) return;
        setProgress(event.frac);
        setPhase(event.phase);
      })
      .then((solved) => {
        if (gen !== genRef.current) return;
        setResult(solved);
        setSolvedK(k);
        setProgress(1);
        setStatus('done');
      })
      .catch((e: Error) => {
        if (gen !== genRef.current) return;
        setError(e.message);
        setStatus('error');
      });
  };

  const node = (path: Move[]): Promise<NodeResult> =>
    clientRef.current
      ? clientRef.current.node(path)
      : Promise.reject(new Error('No solved matrix; solve first.'));

  const reset = () => {
    genRef.current++;
    setStatus('idle');
    setProgress(0);
    setPhase(null);
    setResult(null);
    setError(null);
    setSolvedK(undefined);
    clientRef.current?.reset().catch(() => {});
  };

  return { status, progress, phase, result, error, solvedK, solve, node, reset };
}
