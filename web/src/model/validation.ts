import type { EditorCell, EditorMatrix } from './matrix';
import { resolveNames } from './matrix';
import { parseRating, toScore } from './scale';

export interface ValidationResult {
  /** Per-cell error message, or null when the cell is valid. */
  cellErrors: (string | null)[][];
  /** Matrix-wide errors (duplicate player labels on one team). */
  globalErrors: string[];
  ok: boolean;
}

/** Validate one cell's ACTIVE layer only — the inactive layer may legitimately
 * be blank or in-progress (§ independent layers) and must never block Solve.
 * Simple mode checks the single rating `s`; best/worst mode checks the `b`/`w`
 * pair with best ≥ worst. A single game is played on one map, so every score
 * must be a whole number. */
function cellError(cell: EditorCell, simple: boolean): string | null {
  if (simple) {
    let single: number;
    try {
      single = parseRating(cell.s);
    } catch (error) {
      return `Rating: ${(error as Error).message}`;
    }
    if (!Number.isInteger(single)) return `Rating (${toScore(single)}) must be a whole number.`;
    return null;
  }

  let best: number;
  let worst: number;
  try {
    best = parseRating(cell.b);
  } catch (error) {
    return `Best map: ${(error as Error).message}`;
  }
  try {
    worst = parseRating(cell.w);
  } catch (error) {
    return `Worst map: ${(error as Error).message}`;
  }
  if (!Number.isInteger(best)) return `Best map (${toScore(best)}) must be a whole number.`;
  if (!Number.isInteger(worst)) return `Worst map (${toScore(worst)}) must be a whole number.`;
  if (best < worst) {
    return `Best map (${toScore(best)}) must be ≥ worst map (${toScore(worst)}).`;
  }
  return null;
}

/** Validate an EditorMatrix: the active rating layer parseable (best ≥ worst in
 * best/worst mode); no two players on the SAME team resolve to the same display
 * label. A player may be left unset (the Player N / Opponent K dropdown default,
 * stored as ''), and the same faction may appear on both teams. The worker
 * assumes a clean Matrix, so the UI gates `solve` on `ok`. `simple` selects
 * which layer to validate, defaulting to best/worst. */
export function validateMatrix(m: EditorMatrix, simple = false): ValidationResult {
  const cellErrors = m.cells.map((row) => row.map((cell) => cellError(cell, simple)));
  const globalErrors: string[] = [];

  // Check distinctness on the RESOLVED names (unset '' filled with its
  // positional label) — the exact set toEngineMatrix ships — so the fill can
  // never manufacture a duplicate the raw-name check would miss. The dropdown
  // greys out taken factions and positional labels are unique by index, so a
  // clash only reaches here via imported/legacy/hand-edited data. Cross-team
  // duplicates stay allowed (each side is checked on its own).
  const checkDistinct = (resolved: string[], side: string) => {
    const counts = new Map<string, number>();
    for (const name of resolved) counts.set(name, (counts.get(name) ?? 0) + 1);
    for (const [name, count] of counts) {
      if (count > 1) globalErrors.push(`${side} team has two players labelled “${name}” — give each a distinct faction.`);
    }
  };
  checkDistinct(resolveNames(m.myNames, 'my'), 'Your');
  checkDistinct(resolveNames(m.enemyNames, 'enemy'), 'Opponent');

  const ok = globalErrors.length === 0 && cellErrors.every((row) => row.every((e) => e === null));
  return { cellErrors, globalErrors, ok };
}
