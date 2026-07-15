import type { EditorCell, EditorMatrix } from './matrix';
import { parseRating, toScore } from './scale';

export interface ValidationResult {
  /** Per-cell error message, or null when the cell is valid. */
  cellErrors: (string | null)[][];
  /** Matrix-wide errors (names). */
  globalErrors: string[];
  ok: boolean;
}

function cellError(cell: EditorCell): string | null {
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
  // A single game is played on one map, so its score is a whole number.
  if (!Number.isInteger(best)) return `Best map (${toScore(best)}) must be a whole number.`;
  if (!Number.isInteger(worst)) return `Worst map (${toScore(worst)}) must be a whole number.`;
  if (best < worst) {
    return `Best map (${toScore(best)}) must be ≥ worst map (${toScore(worst)}).`;
  }
  return null;
}

/** Validate an EditorMatrix against the CLI's rules (docs/web-design.md §6):
 * every cell parseable with best ≥ worst; names non-empty and all distinct.
 * The worker assumes a clean Matrix, so the UI gates `solve` on `ok`. */
export function validateMatrix(m: EditorMatrix): ValidationResult {
  const cellErrors = m.cells.map((row) => row.map(cellError));
  const globalErrors: string[] = [];

  const checkNames = (names: string[], side: string) => {
    names.forEach((name, i) => {
      if (name.trim() === '') globalErrors.push(`${side} player ${i + 1} needs a name.`);
    });
  };
  checkNames(m.myNames, 'Your');
  checkNames(m.enemyNames, 'Opponent');

  const counts = new Map<string, number>();
  for (const name of [...m.myNames, ...m.enemyNames]) {
    const key = name.trim();
    if (key !== '') counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [name, count] of counts) {
    if (count > 1) globalErrors.push(`Duplicate name: "${name}" (every player must be distinct).`);
  }

  const ok = globalErrors.length === 0 && cellErrors.every((row) => row.every((e) => e === null));
  return { cellErrors, globalErrors, ok };
}
