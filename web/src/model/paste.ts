import type { EditorCell } from './matrix';
import { withSingle } from './matrix';

/** Parse pasted spreadsheet text into an n×n grid of raw cell strings. Rows are
 * newline-separated; cells are tab/comma/semicolon-separated. A cell is either
 * "best/worst", a single number (best = worst), or — when a row holds exactly
 * 2n plain numbers — best/worst alternating columns. Every cell's single rating
 * is backfilled from the pair via withSingle (a single number fills all three;
 * a best/worst pair takes their half-up average). Short input pads with blanks;
 * extra rows/columns are dropped. (docs/design-mockup.html paste modal.) */
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
      return Array.from({ length: n }, (_, j) => withSingle({ b: tokens[2 * j] ?? '', w: tokens[2 * j + 1] ?? '' }));
    }
    return Array.from({ length: n }, (_, j) => {
      const token = tokens[j] ?? '';
      if (token.includes('/')) {
        const [b, w] = token.split('/');
        return withSingle({ b: (b ?? '').trim(), w: (w ?? '').trim() });
      }
      return withSingle({ b: token, w: token });
    });
  });
}
