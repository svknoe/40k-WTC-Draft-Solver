/** Test-only naive reference solver: a plain recursive, memoised solve over
 * object states — no packing, no key arrays, no level enumeration — sharing
 * only zeroSum's gameValue with the real engine. It independently re-derives
 * root game values for small matrices so the engine's enumeration, induction,
 * packing, and endgame arithmetic can be cross-checked (spec 2026-07-15).
 * Import from tests only; exponential-ish, fine for n <= 6. */
import type { Matrix } from './types';
import { gameValue } from './zeroSum';

export function referenceValue(matrix: Matrix, neutralWeight = 0.5): number {
  const n = matrix.n;
  const endgameN = n % 2 === 1 ? 3 : 4;
  const best = matrix.cells.map((row) => row.map((c) => c.best));
  const worst = matrix.cells.map((row) => row.map((c) => c.worst));
  const neutral = (i: number, j: number): number =>
    worst[i][j] + neutralWeight * (best[i][j] - worst[i][j]);

  const memo = new Map<string, number>();

  const pairs = (pool: number[]): [number, number][] => {
    const out: [number, number][] = [];
    for (let i = 0; i < pool.length - 1; i++) {
      for (let j = i + 1; j < pool.length; j++) out.push([pool[i], pool[j]]);
    }
    return out;
  };
  const without = (pool: number[], ...drop: number[]): number[] =>
    pool.filter((x) => !drop.includes(x));

  /** Round start: both sides pick a defender (|myPool| x |enPool| game). */
  function noneValue(myPool: number[], enPool: number[]): number {
    const key = `${myPool.join(',')}|${enPool.join(',')}`;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const a: number[] = [];
    for (const myDef of myPool) {
      for (const enDef of enPool) a.push(defenderValue(myPool, myDef, enPool, enDef));
    }
    const v = gameValue(a, myPool.length, enPool.length);
    memo.set(key, v);
    return v;
  }

  /** Defenders are up: each side picks an unordered attacker pair (1x1 when
   * only two players remain — the forced odd-endgame attackers). */
  function defenderValue(myPool: number[], myDef: number, enPool: number[], enDef: number): number {
    const myPairs = pairs(without(myPool, myDef));
    const enPairs = pairs(without(enPool, enDef));
    const a: number[] = [];
    for (const mp of myPairs) {
      for (const ep of enPairs) a.push(refusalValue(myPool, myDef, mp, enPool, enDef, ep));
    }
    return gameValue(a, myPairs.length, enPairs.length);
  }

  /** Attackers are up: the 2x2 refusal game (row = enemy attacker I refuse,
   * column = my attacker the enemy refuses — engine orientation). */
  function refusalValue(
    myPool: number[], myDef: number, [fA, fB]: [number, number],
    enPool: number[], enDef: number, [eA, eB]: [number, number],
  ): number {
    const cell = (iRefuse: number, theyRefuse: number): number => {
      const enemyKept = iRefuse === eA ? eB : eA;
      const myKept = theyRefuse === fA ? fB : fA;
      let v = best[myDef][enemyKept] + worst[myKept][enDef];
      const myNext = without(myPool, myDef, myKept); // my refused attacker stays in
      const enNext = without(enPool, enDef, enemyKept);
      if (myPool.length === endgameN) {
        v += neutral(theyRefuse, iRefuse); // refused vs refused
        const myLast = without(myNext, theyRefuse);
        const enLast = without(enNext, iRefuse);
        if (myLast.length === 1) v += neutral(myLast[0], enLast[0]); // even endgame only
      } else {
        v += noneValue(myNext, enNext);
      }
      return v;
    };
    const a = [cell(eA, fA), cell(eA, fB), cell(eB, fA), cell(eB, fB)];
    return gameValue(a, 2, 2);
  }

  const all = Array.from({ length: n }, (_, i) => i);
  return noneValue(all, [...all]);
}
