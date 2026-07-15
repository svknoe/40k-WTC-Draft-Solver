import type { Matrix } from '../engine/types';
import { parseRating, toInputString } from './scale';

/** Derived from the engine's Matrix so the two unions can never drift. */
export type MatrixSize = Matrix['n'];

/** One editor cell: 0-20 strings AS TYPED (best `b`, worst `w`). Storing raw
 * strings tolerates in-progress/invalid edits and round-trips losslessly;
 * conversion to the internal scale happens on solve (docs/web-design.md §4.2). */
export interface EditorCell {
  b: string;
  w: string;
}

/** The editor's working matrix (the `current` block of the localStorage blob). */
export interface EditorMatrix {
  n: MatrixSize;
  myTeam: string;
  enemyTeam: string;
  myNames: string[];
  enemyNames: string[];
  cells: EditorCell[][];
}

const empty = (): EditorCell => ({ b: '', w: '' });

export function blank(n: MatrixSize): EditorMatrix {
  return {
    n,
    myTeam: '',
    enemyTeam: '',
    myNames: Array.from({ length: n }, () => ''),
    enemyNames: Array.from({ length: n }, () => ''),
    cells: Array.from({ length: n }, () => Array.from({ length: n }, empty)),
  };
}

/** Parse an EditorMatrix to the engine's internal-scale Matrix. Throws
 * RangeError if any cell is unparseable — callers validate first (§6). */
export function toEngineMatrix(m: EditorMatrix): Matrix {
  return {
    n: m.n,
    myNames: [...m.myNames],
    enemyNames: [...m.enemyNames],
    cells: m.cells.map((row) =>
      row.map((cell) => ({ best: parseRating(cell.b), worst: parseRating(cell.w) }))),
  };
}

/** Swap which side you captain: transpose the grid AND re-express every score
 * from the opposing captain's view — their score is `20 - mine`, and the best
 * map for one side is the worst for the other (docs/design-mockup.html). Cells
 * must be parseable; tokens normalise to numbers. */
export function transpose(m: EditorMatrix): EditorMatrix {
  const flip = (raw: string): string => toInputString(-parseRating(raw));
  return {
    n: m.n,
    myTeam: m.enemyTeam,
    enemyTeam: m.myTeam,
    myNames: [...m.enemyNames],
    enemyNames: [...m.myNames],
    cells: Array.from({ length: m.n }, (_, i) =>
      Array.from({ length: m.n }, (_, j) => ({
        b: flip(m.cells[j][i].w), // new best map = old worst map, value negated
        w: flip(m.cells[j][i].b),
      }))),
  };
}

const defaultMyName = (i: number): string => `Player ${i + 1}`;
const defaultEnemyName = (j: number): string => `Opponent ${j + 1}`;

/** Change team size, preserving the overlapping top-left block and padding or
 * truncating names/rows/columns. Added name slots get the default
 * Player/Opponent labels; slots that already existed keep their text (even
 * blank). New cells stay blank. */
export function resize(m: EditorMatrix, n: MatrixSize): EditorMatrix {
  return {
    n,
    myTeam: m.myTeam,
    enemyTeam: m.enemyTeam,
    myNames: Array.from({ length: n }, (_, i) => m.myNames[i] ?? defaultMyName(i)),
    enemyNames: Array.from({ length: n }, (_, j) => m.enemyNames[j] ?? defaultEnemyName(j)),
    cells: Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => ({ ...(m.cells[i]?.[j] ?? empty()) }))),
  };
}

/** A full reset at size n: default player names, blank team names, and an even
 * 10-10 game in every cell — immediately valid, ready to overwrite. */
export function cleared(n: MatrixSize): EditorMatrix {
  return {
    n,
    myTeam: '',
    enemyTeam: '',
    myNames: Array.from({ length: n }, (_, i) => defaultMyName(i)),
    enemyNames: Array.from({ length: n }, (_, j) => defaultEnemyName(j)),
    cells: Array.from({ length: n }, () => Array.from({ length: n }, () => ({ b: '10', w: '10' }))),
  };
}

/** Rewrite every cell with two independent integer draws in 0-20 (larger →
 * best map, smaller → worst), keeping all names. rng is injectable for tests
 * and must return values in [0, 1). */
export function randomized(m: EditorMatrix, rng: () => number = Math.random): EditorMatrix {
  const draw = () => Math.floor(rng() * 21);
  return {
    ...m,
    myNames: [...m.myNames],
    enemyNames: [...m.enemyNames],
    cells: m.cells.map((row) => row.map(() => {
      const [a, b] = [draw(), draw()];
      return { b: String(Math.max(a, b)), w: String(Math.min(a, b)) };
    })),
  };
}

/** The persisted / exported shape: an EditorMatrix minus `n`, which is derived
 * from myNames.length. Matches the localStorage `current` block and the export
 * file body (docs/web-design.md §4.2/§4.3). */
export interface SavedMatrix {
  myTeam: string;
  enemyTeam: string;
  myNames: string[];
  enemyNames: string[];
  cells: EditorCell[][];
}

export function toSaved(m: EditorMatrix): SavedMatrix {
  return {
    myTeam: m.myTeam,
    enemyTeam: m.enemyTeam,
    myNames: m.myNames,
    enemyNames: m.enemyNames,
    cells: m.cells,
  };
}

function isSize(n: number): n is MatrixSize {
  return Number.isInteger(n) && n >= 3 && n <= 8;
}

/** Rebuild an EditorMatrix from a SavedMatrix, deriving and checking n and the
 * grid shape. Throws a specific message on a malformed shape (import surfaces
 * it; storage wraps it in try/catch and falls back to defaults). */
export function fromSaved(s: SavedMatrix): EditorMatrix {
  const n = s?.myNames?.length;
  if (!isSize(n)) {
    throw new Error(`Team size must be 3-8 (got ${n}).`);
  }
  if (s.enemyNames?.length !== n || s.cells?.length !== n) {
    throw new Error(`Expected ${n} rows, got ${s.cells?.length}.`);
  }
  for (const row of s.cells) {
    if (row?.length !== n) throw new Error(`Expected ${n} columns per row, got ${row?.length}.`);
  }
  return {
    n,
    myTeam: s.myTeam ?? '',
    enemyTeam: s.enemyTeam ?? '',
    myNames: [...s.myNames],
    enemyNames: [...s.enemyNames],
    cells: s.cells.map((row) => row.map((c) => ({ b: String(c.b ?? ''), w: String(c.w ?? '') }))),
  };
}
