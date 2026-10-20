import { describe, expect, test } from 'vitest';
import { DraftEngine } from './engine';
import type { Matrix } from './types';

const names = (prefix: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`);

/** A deterministic matrix with a real best/worst spread in every cell. */
function spreadMatrix(n: Matrix['n'], neutral?: (best: number, worst: number) => number): Matrix {
  return {
    n,
    myNames: names('F', n),
    enemyNames: names('E', n),
    cells: Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => {
        const worst = ((i * 7 + j * 3) % 9) - 5;
        const best = worst + ((i + 2 * j) % 4) + 1;
        return neutral === undefined ? { best, worst } : { best, worst, neutral: neutral(best, worst) };
      })),
  };
}

const solve = (m: Matrix): number => new DraftEngine(m, null, 0.5).solve();

describe('per-cell neutral value', () => {
  test('an explicit neutral equal to the midpoint changes nothing', () => {
    const plain = solve(spreadMatrix(4));
    const explicit = solve(spreadMatrix(4, (b, w) => w + 0.5 * (b - w)));
    expect(explicit).toBeCloseTo(plain, 9);
  });

  test('raising every neutral by 1 raises an even-size value by exactly 2 (refused + last)', () => {
    const base = solve(spreadMatrix(4, (b, w) => w + 0.5 * (b - w)));
    const raised = solve(spreadMatrix(4, (b, w) => w + 0.5 * (b - w) + 1));
    expect(raised - base).toBeCloseTo(2, 9);
  });

  test('raising every neutral by 1 raises an odd-size value by exactly 1 (refused only)', () => {
    const base = solve(spreadMatrix(5, (b, w) => w + 0.5 * (b - w)));
    const raised = solve(spreadMatrix(5, (b, w) => w + 0.5 * (b - w) + 1));
    expect(raised - base).toBeCloseTo(1, 9);
  });

  test('the neutral value is used instead of the weight', () => {
    // neutral = worst everywhere must equal solving with weight 0.
    const viaNeutral = solve(spreadMatrix(4, (_b, w) => w));
    const viaWeight = new DraftEngine(spreadMatrix(4), null, 0).solve();
    expect(viaNeutral).toBeCloseTo(viaWeight, 9);
  });
});
