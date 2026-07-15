/** Shared engine/UI data shapes (docs/web-design.md §3–§4). */

/** §4.1 — the matrix that crosses the worker boundary. Cell values are on the
 * INTERNAL scale (score − 10, range −10..+10); 0–20 conversion is a UI
 * presentation concern. Player indices are the array positions — the caller
 * fixes the ordering (the conformance fixtures use the Python engine's
 * name-sorted order). */
export interface Matrix {
  n: 3 | 4 | 5 | 6 | 7 | 8;
  myNames: string[];
  enemyNames: string[];
  cells: { best: number; worst: number }[][];
}

/** A decision made walking the draft tree (§3.1) — engine-internal encoding;
 * the UI treats a path as an opaque list it appends to. Every stage of this
 * draft is a simultaneous move, so each Move carries both sides' choices.
 * For 'refusal': `my` is the index of the ENEMY attacker my side refuses,
 * `enemy` the index of the FRIENDLY attacker the enemy refuses. */
export type Move =
  | { stage: 'defender'; my: number; enemy: number }
  | { stage: 'attackers'; my: [number, number]; enemy: [number, number] }
  | { stage: 'refusal'; my: number; enemy: number };

/** §3.3 — the per-node payload the trainer + Why panel consume. */
export interface NodeChoice {
  id: number | [number, number];
  name: string | [string, string];
  /** Equilibrium mixed-strategy weight (LP), NOT softmax(ev). */
  prob: number;
  /** Value of the sub-game reached by fixing this choice against the
   * opponent's equilibrium mix (a row expectation over the payoff matrix). */
  ev: number;
}

export interface NodeResult {
  stage: 'defender' | 'attackers' | 'refusal' | 'done';
  side: 'my' | 'enemy' | 'simultaneous';
  round: 1 | 2 | 3;
  choices: NodeChoice[];
  why: {
    rowLabels: string[];
    colLabels: string[];
    payoff: number[][];
    myStrategy: number[];
    enStrategy: number[];
  } | null;
}

// --- §3.1/§3.2 worker message protocol ---

export interface SolveRequest {
  type: 'solve';
  reqId: number;
  protocol: 1;
  matrix: Matrix;
  /** k-restriction (null = exact). */
  k: number | null;
  /** Neutral-game weight w (default 0.5 = midpoint). */
  neutralWeight?: number;
}

export interface NodeRequest { type: 'node'; reqId: number; path: Move[] }
export interface ResetRequest { type: 'reset'; reqId: number }
export type WorkerRequest = SolveRequest | NodeRequest | ResetRequest;

export interface ProgressEvent {
  type: 'progress';
  reqId: number;
  frac: number;
  phase: 'enumerating' | 'inducting';
}

export interface SolvedEvent {
  type: 'solved';
  reqId: number;
  /** Equilibrium expected team result (internal scale). */
  expected: number;
  root: NodeResult;
}

export interface NodeResultEvent { type: 'nodeResult'; reqId: number; node: NodeResult }
export interface ResetOkEvent { type: 'reset-ok'; reqId: number }
export interface ErrorEvent { type: 'error'; reqId: number; code: string; message: string }
export type WorkerResponse = ProgressEvent | SolvedEvent | NodeResultEvent | ResetOkEvent | ErrorEvent;
