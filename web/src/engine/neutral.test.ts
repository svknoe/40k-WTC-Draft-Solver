import { describe, expect, test } from 'vitest';
import { DraftEngine } from './engine';
import { referenceValue } from './reference';
import type { MapRatings, Matrix } from './types';

const names = (prefix: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`);

/** Places a matchup's best, worst and in-between rating on maps A/B/C. */
type Layout = (best: number, worst: number, mid: number) => MapRatings;
const BWM: Layout = (b, w, m) => [b, w, m];

/** A deterministic matrix with a real spread in every cell: best − worst ≥ 3,
 * and `mid` (worst + 1 + midShift) strictly between them for midShift < 2. */
function spreadMatrix(
  n: Matrix['n'],
  neutralMap: Matrix['neutralMap'],
  layout: Layout = BWM,
  mid: (best: number, worst: number) => number = (_b, w) => w + 1,
): Matrix {
  return {
    n,
    myNames: names('F', n),
    enemyNames: names('E', n),
    neutralMap,
    cells: Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => {
        const worst = ((i * 7 + j * 3) % 9) - 5;
        const best = worst + ((i + 2 * j) % 4) + 3;
        return { maps: layout(best, worst, mid(best, worst)) };
      })),
  };
}

const solve = (m: Matrix, weight = 0.5): number => new DraftEngine(m, null, weight).solve();
const raised = (_b: number, w: number): number => w + 2; // still strictly below best

describe('neutral games on the neutral map', () => {
  test.each([[4, 2], [5, 1]] as const)(
    'raising the neutral map by 1 everywhere raises the n=%i value by exactly %i (refused + last)',
    (n, delta) => {
      const base = solve(spreadMatrix(n, 'C'));
      expect(solve(spreadMatrix(n, 'C', BWM, raised)) - base).toBeCloseTo(delta, 9);
    },
  );

  test.each([4, 5] as const)('raising a map that is not the neutral map changes nothing at n=%i', (n) => {
    // Map C strictly between best and worst and not neutral: no game is played on it.
    const base = solve(spreadMatrix(n, 'A'));
    expect(solve(spreadMatrix(n, 'A', BWM, raised))).toBeCloseTo(base, 9);
  });

  test('which slot holds best and worst is irrelevant', () => {
    const bw = solve(spreadMatrix(6, 'C', (b, w, m) => [b, w, m]));
    const wb = solve(spreadMatrix(6, 'C', (b, w, m) => [w, b, m]));
    expect(wb).toBeCloseTo(bw, 9);
  });

  test('no neutral map with weight 0.5 equals a neutral map at the exact midpoint', () => {
    const viaWeight = solve(spreadMatrix(5, null), 0.5);
    const viaMap = solve(spreadMatrix(5, 'C', BWM, (b, w) => w + 0.5 * (b - w)));
    expect(viaMap).toBeCloseTo(viaWeight, 9);
  });

  test.each([5, 6] as const)('the brute-force reference agrees with the engine at n=%i', (n) => {
    // Neutral map C strictly between best and worst, off the midpoint.
    const m = spreadMatrix(n, 'C');
    expect(referenceValue(m)).toBeCloseTo(solve(m), 9);
    // Guard against a vacuous check: the neutral map must actually change the value.
    expect(Math.abs(solve(m) - solve(spreadMatrix(n, null)))).toBeGreaterThan(1e-6);
  });

  test('k-restriction saturates at k = n - 1 with a neutral map (n=6, map B)', () => {
    const m = spreadMatrix(6, 'B', (b, w, mid) => [w, mid, b]);
    expect(new DraftEngine(m, 5, 0.5).solve()).toBeCloseTo(solve(m), 9);
  });
});
