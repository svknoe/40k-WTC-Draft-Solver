/** Conversion between the community 0-20 score scale (every human-facing
 * surface) and the engine's internal deviation-from-even scale
 * (internal = score - 10, range -10..+10). Mirrors the Python engine's
 * initialise_dictionaries.parse_rating (docs/web-design.md §6, PLAN.md §C). */

const TOKENS: Record<string, number> = {
  '--': -8,
  '-': -4,
  '0': 0, // the legacy EVEN token (10-10) — NOT the score 0 (write "0.0" for that)
  '+': 4,
  '++': 8,
};

/** Parse one raw cell string (a 0-20 number or a legacy token) to the internal
 * scale. Throws RangeError on empty / non-numeric / out-of-range input. */
export function parseRating(raw: string): number {
  const s = raw.trim();
  if (s in TOKENS) return TOKENS[s];
  const num = Number(s);
  if (s === '' || !Number.isFinite(num)) {
    throw new RangeError(`Not a rating: "${raw}" (expected 0-20 or one of --, -, 0, +, ++).`);
  }
  if (num < 0 || num > 20) {
    throw new RangeError(`Score must be between 0 and 20: "${raw}".`);
  }
  return num - 10;
}

/** Internal scale -> community 0-20 score. */
export const toScore = (internal: number): number => internal + 10;

/** The editor input string whose parseRating() is exactly `internal` — the
 * inverse used when seeding the grid from engine values (samples, transpose).
 * Handles the bare-0 quirk: score 0 (internal -10) serialises as "0.0", since
 * "0" is the even token (internal 0), not the score 0. */
export function toInputString(internal: number): string {
  const score = toScore(internal);
  return score === 0 ? '0.0' : String(score);
}

/** Render a cell's best/worst internal values as "best / worst" on the 0-20
 * scale (e.g. "15 / 12"). */
export const formatCell = (cell: { best: number; worst: number }): string =>
  `${toScore(cell.best)} / ${toScore(cell.worst)}`;
