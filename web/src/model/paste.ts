import type { EditorCell } from './matrix';
import { normaliseCell } from './matrix';

/** Parse pasted spreadsheet text into an n×n grid of cells. Rows are
 * newline-separated; cells are tab/comma/semicolon-separated. A cell token is
 * "a/b/c" (maps A, B, C), "best/worst" (maps A and B), or a single number
 * (map A) — or, when a row holds exactly 2n plain numbers, best/worst
 * alternating columns. Every cell's single rating is backfilled from its maps
 * via normaliseCell (half-up rounded mean). Short input pads with blanks;
 * extra rows/columns/maps are dropped. (docs/design-mockup.html paste modal.) */
export function parsePaste(text: string, n: number): EditorCell[][] {
  const rows = text
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter((r) => r.length > 0);

  return Array.from({ length: n }, (_, i) => {
    const tokens = (rows[i] ?? '')
      .split(/[\t,;]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    if (tokens.length === 2 * n) {
      return Array.from({ length: n }, (_, j) => normaliseCell({ maps: [tokens[2 * j], tokens[2 * j + 1], ''] }));
    }
    return Array.from({ length: n }, (_, j) => {
      const parts = (tokens[j] ?? '').split('/').map((p) => p.trim());
      return normaliseCell({ maps: [parts[0] ?? '', parts[1] ?? '', parts[2] ?? ''] });
    });
  });
}
