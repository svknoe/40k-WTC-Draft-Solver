import type { Matrix } from '../engine/types';
import type { Disposition } from './dispositions';
import { DISPOSITIONS, toDisposition } from './dispositions';
import { FACTIONS } from './factions';
import { parseRating, toInputString, toScore } from './scale';

/** Derived from the engine's Matrix so the two unions can never drift. */
export type MatrixSize = Matrix['n'];

/** A cell's map A, B and C ratings, as typed. */
export type MapTriple = [string, string, string];

/** The labels of the three maps, in storage order. */
export const MAP_LETTERS = ['A', 'B', 'C'] as const;

/** One of the three map letters. */
export type MapLetter = typeof MAP_LETTERS[number];

/** The storage index (0, 1, 2) of a map letter. */
export const mapIndex = (letter: MapLetter): number => MAP_LETTERS.indexOf(letter);

const toMapLetter = (raw: unknown): MapLetter =>
  (MAP_LETTERS as readonly unknown[]).includes(raw) ? (raw as MapLetter) : 'A';

/** One editor cell: 0-20 strings AS TYPED. Storing raw strings tolerates
 * in-progress/invalid edits and round-trips losslessly; conversion to the
 * internal scale happens on solve (docs/web-design.md §4.2). The map ratings
 * `maps` (A, B, C — any 1 to 3 may be filled) and the single rating `s` are
 * independent layers: the active rating mode decides which is edited,
 * validated and solved, and only Clear / Random / import / paste write both,
 * so switching modes never destroys data. */
export interface EditorCell {
  maps: MapTriple;
  s: string;
}

/** The editor's working matrix (the `current` block of the localStorage blob). */
export interface EditorMatrix {
  n: MatrixSize;
  myTeam: string;
  enemyTeam: string;
  myNames: string[];
  enemyNames: string[];
  /** Per-player force disposition — display only, the solver ignores it. */
  myDispositions: Disposition[];
  enemyDispositions: Disposition[];
  /** The map neutral games (refused vs refused, last vs last) are played on. */
  neutralMap: MapLetter;
  cells: EditorCell[][];
}

const empty = (): EditorCell => ({ maps: ['', '', ''], s: '' });
const copyCell = (cell: EditorCell): EditorCell => ({ maps: [...cell.maps], s: cell.s });
const unset = (n: number): Disposition[] => Array.from({ length: n }, (): Disposition => '');

/** The positional label a player falls back to when no faction is chosen (the
 * stored name is ''). Presentation only: the editor stores '' for "unset", and
 * these labels surface it as Player N / Opponent K in the dropdown top option
 * (Grid) and in the solved/drafted model (toEngineMatrix). */
export const defaultMyName = (i: number): string => `Player ${i + 1}`;
export const defaultEnemyName = (j: number): string => `Opponent ${j + 1}`;

/** Resolve a team's editor names to the display labels the engine and every
 * downstream view actually use: an unset slot ('') becomes its positional
 * Player N / Opponent K label. This is the single source of truth for that
 * fill — `toEngineMatrix` ships this set and `validateMatrix` checks
 * distinctness on it, so the fill can never manufacture a duplicate label that
 * validation didn't see. */
export function resolveNames(names: readonly string[], kind: 'my' | 'enemy'): string[] {
  const label = kind === 'my' ? defaultMyName : defaultEnemyName;
  return names.map((name, i) => name.trim() || label(i));
}

/** A cell's filled maps on the internal scale, in A/B/C order. Throws
 * RangeError if a filled map is unparseable. */
export function filledMaps(cell: EditorCell): number[] {
  return cell.maps.filter((raw) => raw.trim() !== '').map(parseRating);
}

/** The mean of a cell's filled maps as a 0-20 score, or null when no map is
 * filled or one is unparseable. Display only: the solver uses the max/min
 * (toEngineMatrix), and neutral games use the chosen neutral map. */
export function mapAverage(cell: EditorCell): number | null {
  try {
    const values = filledMaps(cell);
    if (values.length === 0) return null;
    return toScore(values.reduce((a, b) => a + b, 0) / values.length);
  } catch {
    return null;
  }
}

/** The 0-20 value a cell shows in the active mode — the map average, or the
 * single rating in simple mode — or null when blank/unparseable. */
export function cellValue(cell: EditorCell, simple: boolean): number | null {
  if (!simple) return mapAverage(cell);
  try {
    return toScore(parseRating(cell.s));
  } catch {
    return null;
  }
}

/** The mean of the non-null values, or null when there are none — the
 * matrix's AVG row/column, which skip blank cells. */
export function meanOf(values: readonly (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length === 0 ? null : present.reduce((a, b) => a + b, 0) / present.length;
}

export function blank(n: MatrixSize): EditorMatrix {
  return {
    n,
    myTeam: '',
    enemyTeam: '',
    myNames: Array.from({ length: n }, () => ''),
    enemyNames: Array.from({ length: n }, () => ''),
    myDispositions: unset(n),
    enemyDispositions: unset(n),
    neutralMap: 'A',
    cells: Array.from({ length: n }, () => Array.from({ length: n }, empty)),
  };
}

/** Parse an EditorMatrix to the engine's internal-scale Matrix, reading the
 * layer the active rating mode shows: simple mode uses the single rating `s`
 * for every game (you solve what you see); by-map mode sends the best and
 * worst of the filled maps — the defender picks the map — and the chosen
 * neutral map as the value of neutral games. Throws RangeError if a cell in
 * the active layer is unparseable or lacks its neutral map — callers validate
 * first (§6). */
export function toEngineMatrix(m: EditorMatrix, simple = false): Matrix {
  const k = mapIndex(m.neutralMap);
  return {
    n: m.n,
    // Surface the positional label for any unset (empty) name, so the engine
    // and every downstream view (DraftTrainer, DraftSummary) show Player N /
    // Opponent K rather than a blank for players left on the dropdown default.
    myNames: resolveNames(m.myNames, 'my'),
    enemyNames: resolveNames(m.enemyNames, 'enemy'),
    cells: m.cells.map((row) =>
      row.map((cell) => {
        if (simple) {
          const v = parseRating(cell.s);
          return { best: v, worst: v, neutral: v };
        }
        if (cell.maps[k].trim() === '') throw new RangeError(`Map ${m.neutralMap} (the neutral map) is blank.`);
        const maps = filledMaps(cell);
        return { best: Math.max(...maps), worst: Math.min(...maps), neutral: parseRating(cell.maps[k]) };
      })),
  };
}

/** Swap which side you captain: transpose the grid AND re-express every score
 * from the opposing captain's view — their score is `20 - mine` on the same
 * map, so each map keeps its letter (and the best map for one side becomes the
 * worst for the other). Names and dispositions swap sides. Flipping is
 * lenient: an unparseable or blank field becomes '' rather than throwing,
 * since Swap is gated only on the active layer and the inactive layer may
 * legitimately be blank. */
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
    myDispositions: [...m.enemyDispositions],
    enemyDispositions: [...m.myDispositions],
    neutralMap: m.neutralMap,
    cells: Array.from({ length: m.n }, (_, i) =>
      Array.from({ length: m.n }, (_, j) => {
        const [a, b, c] = m.cells[j][i].maps;
        return { maps: [flip(a), flip(b), flip(c)], s: flip(m.cells[j][i].s) };
      })),
  };
}

/** Change team size, preserving the overlapping top-left block and padding or
 * truncating names/dispositions/rows/columns. Added slots start unset; slots
 * that already existed keep their values. New cells stay blank. */
export function resize(m: EditorMatrix, n: MatrixSize): EditorMatrix {
  return {
    n,
    myTeam: m.myTeam,
    enemyTeam: m.enemyTeam,
    myNames: Array.from({ length: n }, (_, i) => m.myNames[i] ?? ''),
    enemyNames: Array.from({ length: n }, (_, j) => m.enemyNames[j] ?? ''),
    myDispositions: Array.from({ length: n }, (_, i) => m.myDispositions[i] ?? ''),
    enemyDispositions: Array.from({ length: n }, (_, j) => m.enemyDispositions[j] ?? ''),
    neutralMap: m.neutralMap,
    cells: Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => copyCell(m.cells[i]?.[j] ?? empty()))),
  };
}

/** A full reset at size n: unset player names and dispositions, blank team
 * names, and an even 10-10 game in every cell (all three maps and the single
 * rating) — immediately valid in both modes, whichever map is neutral. */
export function cleared(n: MatrixSize): EditorMatrix {
  return {
    ...blank(n),
    cells: Array.from({ length: n }, () =>
      Array.from({ length: n }, (): EditorCell => ({ maps: ['10', '10', '10'], s: '10' }))),
  };
}

/** A shuffled copy (Fisher–Yates) driven by rng, which returns values in [0, 1). */
function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const k = Math.floor(rng() * (i + 1));
    [out[i], out[k]] = [out[k], out[i]];
  }
  return out;
}

/** One team's random dispositions: every disposition once before any repeats,
 * and none more than twice — so a team of 5+ fields each one 1-2 times, and a
 * smaller team gets n distinct ones. Positions are shuffled too. */
function randomDispositions(n: number, rng: () => number): Disposition[] {
  const picks = [...shuffled(DISPOSITIONS, rng), ...shuffled(DISPOSITIONS, rng)].slice(0, n);
  return shuffled(picks, rng);
}

/** A random practice matchup, keeping the team names. Every cell gets three
 * independent integer draws in 0-20 — one per map — filling BOTH layers
 * regardless of the active mode: A/B/C take the draws in order and the single
 * rating takes their mean rounded to the nearest whole number (a mean of three
 * integers is never a .5 tie). Each team then gets n distinct factions (both
 * teams may share one) and random dispositions (see randomDispositions). rng
 * is injectable for tests and must return values in [0, 1); cells draw first. */
export function randomized(m: EditorMatrix, rng: () => number = Math.random): EditorMatrix {
  const draw = () => Math.floor(rng() * 21);
  // toInputString maps a drawn 0-20 score straight to its plain input string.
  const asInput = (score: number) => toInputString(score - 10);
  const cell = (): EditorCell => {
    const [a, b, c] = [draw(), draw(), draw()];
    return { maps: [asInput(a), asInput(b), asInput(c)], s: asInput(Math.round((a + b + c) / 3)) };
  };
  const cells = m.cells.map((row) => row.map(cell));
  return {
    ...m,
    myNames: shuffled(FACTIONS, rng).slice(0, m.n),
    enemyNames: shuffled(FACTIONS, rng).slice(0, m.n),
    myDispositions: randomDispositions(m.n, rng),
    enemyDispositions: randomDispositions(m.n, rng),
    cells,
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
  myDispositions: Disposition[];
  enemyDispositions: Disposition[];
  /** Defaults to A when absent. */
  neutralMap?: MapLetter;
  cells: EditorCell[][];
}

export function toSaved(m: EditorMatrix): SavedMatrix {
  return {
    myTeam: m.myTeam,
    enemyTeam: m.enemyTeam,
    myNames: m.myNames,
    enemyNames: m.enemyNames,
    myDispositions: m.myDispositions,
    enemyDispositions: m.enemyDispositions,
    neutralMap: m.neutralMap,
    cells: m.cells,
  };
}

/** The single rating implied by a cell's maps: the mean of the filled maps
 * rounded half up, '' when none is filled or one is unparseable. */
export function singleFromMaps(maps: MapTriple): string {
  try {
    const values = filledMaps({ maps, s: '' });
    if (values.length === 0) return '';
    return toInputString(Math.round(values.reduce((a, b) => a + b, 0) / values.length));
  } catch {
    return '';
  }
}

/** Read one saved cell. A cell must carry a `maps` array (padded to three);
 * anything else is malformed — older formats are not supported. */
export function readCell(raw: unknown): EditorCell {
  const cell = raw as { maps?: unknown; s?: unknown } | null;
  if (!cell || !Array.isArray(cell.maps)) throw new Error('Malformed matrix cell.');
  const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v));
  return { maps: [str(cell.maps[0]), str(cell.maps[1]), str(cell.maps[2])], s: str(cell.s) };
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
    myDispositions: Array.from({ length: n }, (_, i) => toDisposition(s.myDispositions?.[i])),
    enemyDispositions: Array.from({ length: n }, (_, j) => toDisposition(s.enemyDispositions?.[j])),
    neutralMap: toMapLetter(s.neutralMap),
    cells: s.cells.map((row) => row.map(readCell)),
  };
}
