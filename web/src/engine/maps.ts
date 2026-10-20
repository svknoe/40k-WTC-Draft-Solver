/** Per-matchup value derivation shared by the engine, the reference solver and
 * the trainer: which map each kind of game is played on, and its rating. */
import type { MapLetter, MapRatings, MatchupCell, Matrix } from './types';
import { MAP_LETTERS } from './types';

function extremeIndex(maps: MapRatings, better: (a: number, b: number) => boolean): number {
  let pick = -1;
  for (let k = 0; k < maps.length; k++) {
    const v = maps[k];
    if (v !== null && (pick === -1 || better(v, maps[pick] as number))) pick = k;
  }
  if (pick === -1) throw new RangeError('A matchup has no rated map.');
  return pick;
}

/** The defender's pick for my side: my highest-rated map (first letter on a tie). */
export const bestMapIndex = (maps: MapRatings): number => extremeIndex(maps, (a, b) => a > b);
/** The enemy defender's pick: my lowest-rated map (first letter on a tie). */
export const worstMapIndex = (maps: MapRatings): number => extremeIndex(maps, (a, b) => a < b);

export const bestOf = (cell: MatchupCell): number => cell.maps[bestMapIndex(cell.maps)] as number;
export const worstOf = (cell: MatchupCell): number => cell.maps[worstMapIndex(cell.maps)] as number;

/** The value of a neutral game (refused vs refused, last vs last) between my
 * player i and enemy j: the neutral map's rating, or — when the matrix's maps
 * carry no identity — worst + neutralWeight × (best − worst). */
export function neutralOf(matrix: Matrix, i: number, j: number, neutralWeight: number): number {
  const cell = matrix.cells[i][j];
  if (matrix.neutralMap === null) {
    const worst = worstOf(cell);
    return worst + neutralWeight * (bestOf(cell) - worst);
  }
  const v = cell.maps[MAP_LETTERS.indexOf(matrix.neutralMap)];
  if (v === null) throw new RangeError(`Map ${matrix.neutralMap} (the neutral map) is not rated.`);
  return v;
}

/** A matchup known only by its best and worst map (the conformance fixtures,
 * hand-built test matrices): maps A = best, B = worst, C unrated. Expects
 * best >= worst, so that bestOf / worstOf (the max and min) return them back. */
export const cellFromBestWorst = (best: number, worst: number): MatchupCell => ({ maps: [best, worst, null] });

/** The kinds of game a matchup can be played as (draftState.FixedGame['kind']). */
export type GameKind = 'my-defends' | 'enemy-defends' | 'refused' | 'last';

/** Whether the matrix's maps carry identity (A/B/C are real layouts). False in
 * single-rating mode and for the conformance fixtures, whose "maps" are just
 * best/worst numbers. */
export const hasMapIdentity = (matrix: Matrix): boolean => matrix.neutralMap !== null;

/** The map a game between my player i and enemy j is played on: my best map
 * when I defend (I pick), my worst when they defend (their best), the neutral
 * map otherwise — or null when the maps carry no identity. */
export function playedMap(matrix: Matrix, i: number, j: number, kind: GameKind): MapLetter | null {
  if (!hasMapIdentity(matrix)) return null;
  const { maps } = matrix.cells[i][j];
  if (kind === 'my-defends') return MAP_LETTERS[bestMapIndex(maps)];
  if (kind === 'enemy-defends') return MAP_LETTERS[worstMapIndex(maps)];
  return matrix.neutralMap;
}
