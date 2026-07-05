/**
 * The k-restriction heuristic — TS port of
 * drafter/common/team_permutation.py (build_restriction /
 * get_heuristically_best_attackers). Restricts each select-attackers step to
 * the k heuristically best attackers per side: an attacker's relative
 * advantage is its value against the opposing defender minus its average
 * value against the rest of the opposing field.
 *
 * All values are from the friendly side's perspective. A friendly attacker
 * plays the enemy defender, who picks the map, so it gets the pairing's
 * worst-map value; an enemy attacker faces the friendly defender's best-map
 * value. Games against the rest of the field have no defender yet and use the
 * neutral (weighted-midpoint) value.
 *
 * Ordering matters beyond the set: the returned RANKED order drives the
 * attacker-pair enumeration order, hence payoff-matrix row/column order and
 * equilibrium selection — it must match the Python engine (Python's sorted()
 * and JS Array.prototype.sort are both stable).
 */

export interface RestrictionTables {
  k: number;
  /** friendly attacker a vs enemy opponent o -> worst[a*n + o] etc.; enemy
   * attacker a vs friendly opponent o reads the transposed cell. */
  worst: Float64Array;
  best: Float64Array;
  neutral: Float64Array;
  n: number;
}

export const FRIENDLY = 0;
export const ENEMY = 1;

export function heuristicallyBestAttackers(
  restriction: RestrictionTables,
  side: number,
  eligibleAttackers: number[],
  opposingDefender: number,
  opposingRemaining: number[],
): number[] {
  const { worst, best, neutral, n, k } = restriction;
  const count = eligibleAttackers.length;
  const advantages = new Float64Array(count);

  for (let index = 0; index < count; index++) {
    const attacker = eligibleAttackers[index];
    let vsDefender: number;
    let vsField = 0;
    if (side === FRIENDLY) {
      vsDefender = worst[attacker * n + opposingDefender];
      for (const opponent of opposingRemaining) vsField += neutral[attacker * n + opponent];
    } else {
      vsDefender = best[opposingDefender * n + attacker];
      for (const opponent of opposingRemaining) vsField += neutral[opponent * n + attacker];
    }
    advantages[index] = vsDefender - vsField / opposingRemaining.length;
  }

  // The friendly side maximises the pairing value, the enemy side minimises
  // it, so the two sides rank in opposite directions (Python ranking_sign).
  const sign = side === FRIENDLY ? -1 : 1;
  const order = eligibleAttackers.map((_, index) => index);
  order.sort((a, b) => sign * (advantages[a] - advantages[b]));

  const restricted: number[] = [];
  for (let rank = 0; rank < Math.min(k, count); rank++) {
    restricted.push(eligibleAttackers[order[rank]]);
  }
  return restricted;
}
