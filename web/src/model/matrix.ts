import type { Matrix } from '../engine/types';
import { parseRating, toInputString, toScore } from './scale';

/** Derived from the engine's Matrix so the two unions can never drift. */
export type MatrixSize = Matrix['n'];

/** One editor cell: 0-20 strings AS TYPED. Storing raw strings tolerates
 * in-progress/invalid edits and round-trips losslessly; conversion to the
 * internal scale happens on solve (docs/web-design.md §4.2). The best `b` and
 * worst `w` maps and the single rating `s` are independent layers: the active
 * rating mode decides which is edited, validated and solved, and only Clear /
 * Random / import write all three at once, so switching modes never destroys
 * data. */
export interface EditorCell {
  b: string;
  w: string;
  s: string;
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

const empty = (): EditorCell => ({ b: '', w: '', s: '' });

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

/** Parse an EditorMatrix to the engine's internal-scale Matrix, reading the
 * layer the active rating mode shows: simple mode uses the single rating `s`
 * as both maps (you solve what you see), best/worst mode uses the `b`/`w` pair.
 * Throws RangeError if a cell in the active layer is unparseable — callers
 * validate first (§6). */
export function toEngineMatrix(m: EditorMatrix, simple = false): Matrix {
  return {
    n: m.n,
    myNames: [...m.myNames],
    enemyNames: [...m.enemyNames],
    cells: m.cells.map((row) =>
      row.map((cell) => {
        if (simple) {
          const v = parseRating(cell.s);
          return { best: v, worst: v };
        }
        return { best: parseRating(cell.b), worst: parseRating(cell.w) };
      })),
  };
}

/** Swap which side you captain: transpose the grid AND re-express every score
 * from the opposing captain's view — their score is `20 - mine`, and the best
 * map for one side is the worst for the other (docs/design-mockup.html). The
 * single rating flips in place. Flipping is lenient: an unparseable or blank
 * field becomes '' rather than throwing, since Swap is gated only on the active
 * layer (§ independent layers) and the inactive layer may legitimately be
 * blank; tokens normalise to numbers. */
export function transpose(m: EditorMatrix): EditorMatrix {
  const flip = (raw: string): string => {
    try {
      return toInputString(-parseRating(raw));
    } catch {
      return '';
    }
  };
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
        s: flip(m.cells[j][i].s), // the single rating is self-inverse under the flip
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
    cells: Array.from({ length: n }, () => Array.from({ length: n }, () => ({ b: '10', w: '10', s: '10' }))),
  };
}

/** Rewrite every cell from two independent integer draws in 0-20, keeping all
 * names. The draws fill BOTH representations regardless of the active mode, so
 * either view is ready to solve: the ordered pair goes to best/worst (larger →
 * best map, smaller → worst) and their average goes to the single rating,
 * breaking a .5 average up or down with 50/50 probability so it stays a whole
 * number. rng is injectable for tests and must return values in [0, 1). */
export function randomized(m: EditorMatrix, rng: () => number = Math.random): EditorMatrix {
  const draw = () => Math.floor(rng() * 21);
  // toInputString keeps a drawn 0 meaning the score 0 ("0.0"), not the even token.
  const asInput = (score: number) => toInputString(score - 10);
  const cell = (): EditorCell => {
    const [a, b] = [draw(), draw()];
    const mean = (a + b) / 2;
    const single = Number.isInteger(mean) ? mean : (rng() < 0.5 ? Math.floor(mean) : Math.ceil(mean));
    return { b: asInput(Math.max(a, b)), w: asInput(Math.min(a, b)), s: asInput(single) };
  };
  return {
    ...m,
    myNames: [...m.myNames],
    enemyNames: [...m.enemyNames],
    cells: m.cells.map((row) => row.map(cell)),
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

/** Normalise a raw saved/pasted cell to an EditorCell, deriving the single
 * rating `s` when it is absent (old localStorage, old exports, pasted grids
 * that carry no single). Derivation: copy `b` when `b === w` (lossless for
 * data authored in simple mode, incl. a fully-blank cell); else the half-up
 * rounded average of the two maps when both parse; else '' (nothing sensible
 * to derive). An `s` that is already present is preserved untouched. */
export function withSingle(cell: { b?: unknown; w?: unknown; s?: unknown }): EditorCell {
  const b = String(cell.b ?? '');
  const w = String(cell.w ?? '');
  const existing = cell.s === undefined || cell.s === null ? '' : String(cell.s);
  if (existing !== '') return { b, w, s: existing };
  if (b === w) return { b, w, s: b };
  try {
    const avg = Math.round((toScore(parseRating(b)) + toScore(parseRating(w))) / 2);
    return { b, w, s: toInputString(avg - 10) };
  } catch {
    return { b, w, s: '' };
  }
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
    cells: s.cells.map((row) => row.map(withSingle)),
  };
}
