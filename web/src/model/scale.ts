/** Conversion between the community 0-20 score scale (every human-facing
 * surface) and the engine's internal deviation-from-even scale
 * (internal = score - 10, range -10..+10). Mirrors the Python engine's
 * initialise_dictionaries.parse_rating (docs/web-design.md §6). */

/** Parse one raw cell string (a 0-20 number) to the internal scale. "0" is the
 * community score 0 (a 20-0 loss) and "10" is an even 10-10 game. Throws
 * RangeError on empty / non-numeric / out-of-range input. */
export function parseRating(raw: string): number {
  const s = raw.trim();
  const num = Number(s);
  if (s === '' || !Number.isFinite(num)) {
    throw new RangeError(`Not a rating: "${raw}" (expected a number 0-20).`);
  }
  if (num < 0 || num > 20) {
    throw new RangeError(`Score must be between 0 and 20: "${raw}".`);
  }
  return num - 10;
}

/** Internal scale -> community 0-20 score. */
export const toScore = (internal: number): number => internal + 10;

/** The editor input string whose parseRating() is exactly `internal` — the
 * inverse used when seeding the grid from engine values (samples, transpose,
 * random fills). Every internal value maps to its plain 0-20 score string:
 * score 0 is "0" and the even game is "10". */
export function toInputString(internal: number): string {
  return String(toScore(internal));
}

/** Render a cell's best/worst internal values as "best / worst" on the 0-20
 * scale (e.g. "15 / 12"). */
export const formatCell = (cell: { best: number; worst: number }): string =>
  `${toScore(cell.best)} / ${toScore(cell.worst)}`;

export interface TeamResult {
  /** My team's total out of 20n. */
  my: number;
  /** Opponent's total out of 20n. */
  enemy: number;
  /** My margin over even (= expected internal margin, rounded). */
  favored: number;
}

/** Convert the engine's internal team margin (sum of n games' deviations) to a
 * displayed team result on the community scale: n games out of 20 → 20n total,
 * even split 10n each, so my = 10n + margin and enemy = 20n − my.
 * The two always sum to 20n. */
export function teamResult(expected: number, n: number): TeamResult {
  const even = 10 * n;
  const my = Math.round(even + expected);
  return { my, enemy: 2 * even - my, favored: my - even };
}

/** My team's exact (unrounded) total on the 0–20n scale for an internal margin
 * — the same baseline teamResult uses, but kept fractional for expected-value
 * figures (the trainer's per-choice EV and projected score). */
export const teamTotal = (margin: number, n: number): number => 10 * n + margin;

/** Format a team total for display: always one decimal (e.g. 86.0 or 86.1).
 * Keeps the trainer's EV cards and projected score on the same scale so they
 * read as the same number. */
export const formatTeamScore = (total: number): string => total.toFixed(1);

/** Format a single game's 0–20 score. A map-determined game (played on a known
 * map) is an integer and shows as a whole number; a neutral 50/50 game (refused
 * / last players) can be a half-step and keeps its one decimal. */
export const formatMatchupScore = (score: number): string =>
  Number.isInteger(score) ? String(score) : score.toFixed(1);

export type ScoreBand = 'worst' | 'bad' | 'okay' | 'good' | 'best';

/** Colour band for a 0-20 score, per the editor legend: worst ≤4, bad 5-8,
 * okay 9-11, good 12-15, best 16+. */
export function scoreBand(score: number): ScoreBand {
  if (score <= 4) return 'worst';
  if (score <= 8) return 'bad';
  if (score <= 11) return 'okay';
  if (score <= 15) return 'good';
  return 'best';
}
