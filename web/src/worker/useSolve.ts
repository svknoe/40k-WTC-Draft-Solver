import { useRef, useState } from 'react';
import type { SolvedEvent } from '../engine/types';
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
  /** k = null → exact; k = 3 → fast preview (§7). */
  solve: (matrix: EditorMatrix, k: number | null) => void;
  reset: () => void;
}

/** Owns one engine WorkerClient for the tab's lifetime and drives the §3 solve
 * request, surfacing real progress. `makeClient` is injectable for tests. */
export function useSolve(makeClient: () => WorkerClient = () => new WorkerClient()): SolveState {
  const clientRef = useRef<WorkerClient | null>(null);
  const [status, setStatus] = useState<SolveStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<'enumerating' | 'inducting' | null>(null);
  const [result, setResult] = useState<SolvedEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    setStatus('solving');
    setProgress(0);
    setPhase(null);
    setError(null);
    setResult(null);
    client()
      .solve(engineMatrix, k, (event) => {
        setProgress(event.frac);
        setPhase(event.phase);
      })
      .then((solved) => {
        setResult(solved);
        setProgress(1);
        setStatus('done');
      })
      .catch((e: Error) => {
        setError(e.message);
        setStatus('error');
      });
  };

  const reset = () => {
    setStatus('idle');
    setProgress(0);
    setPhase(null);
    setResult(null);
    setError(null);
    clientRef.current?.reset().catch(() => {});
  };

  return { status, progress, phase, result, error, solve, reset };
}
