import type { EditorCell, MapTriple } from './matrix';
import { singleFromMaps } from './matrix';

const blankCell = (): EditorCell => ({ maps: ['', '', ''], s: '' });

/** One pasted token: "a/b/c" is maps A, B, C (single rating = their rounded
 * mean); a single number is the same score on all three maps and the single
 * rating. Anything else (e.g. a two-value "15/12") is a blank cell. */
function cellOf(token: string): EditorCell {
  if (token === '') return blankCell();
  if (!token.includes('/')) return { maps: [token, token, token], s: token };
  const parts = token.split('/').map((p) => p.trim());
  if (parts.length !== 3) return blankCell();
  const maps: MapTriple = [parts[0], parts[1], parts[2]];
  return { maps, s: singleFromMaps(maps) };
}

/** Parse pasted spreadsheet text into an n×n grid of cells. Rows are
 * newline-separated; cells are tab/comma/semicolon-separated (see cellOf).
 * Short input pads with blanks; extra rows/columns are dropped.
 * (docs/design-mockup.html paste modal.) */
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
    return Array.from({ length: n }, (_, j) => cellOf(tokens[j] ?? ''));
  });
}
