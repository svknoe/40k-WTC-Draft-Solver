import { describe, expect, test } from 'vitest';
import { DraftEngine } from './engine';
import { referenceValue } from './reference';
import type { Matrix, Move } from './types';

const names = (prefix: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`);

/** best = worst = v: no map spread, so the neutral value is v too. */
function flatMatrix(v: number[][]): Matrix {
  const n = v.length;
  return {
    n,
    myNames: names('F', n),
    enemyNames: names('E', n),
    cells: v.map((row) => row.map((x) => ({ best: x, worst: x }))),
  };
}

/** v[i][j] = a[i] + b[j]: every full pairing sums to sum(a) + sum(b), so the
 * root value is exactly that constant — a hand-computable structural check
 * that the endgame fixes exactly n games (no dropped or phantom game). */
function additiveMatrix(a: number[], b: number[]): Matrix {
  return flatMatrix(a.map((ai) => b.map((bj) => ai + bj)));
}

/** Mixed-value 3x3 for the hand-computed refusal payoff below. */
const V3 = [
  [2, 0, -2],
  [4, 2, 0],
  [-4, 0, 6],
];

/** Arbitrary 5x5 with real map spread for the reference cross-check. */
const BEST5 = [
  [2, 6, 9, -3, 1],
  [6, 1, -1, 4, 3],
  [5, -7, 0, 2, 8],
  [-2, 3, 4, 0, -5],
  [1, 0, -6, 7, 2],
];
const WORST5 = [
  [0, 2, 5, -6, -1],
  [3, -1, -4, 0, 1],
  [1, -9, -2, 0, 4],
  [-5, 1, 0, -3, -8],
  [-2, -4, -8, 3, 0],
];
const matrix5: Matrix = {
  n: 5,
  myNames: names('F', 5),
  enemyNames: names('E', 5),
  cells: BEST5.map((row, i) => row.map((bij, j) => ({ best: bij, worst: WORST5[i][j] }))),
};

describe('odd team sizes', () => {
  test('3-player root value matches the reference solver', () => {
    const m = flatMatrix(V3);
    expect(new DraftEngine(m, null).solve()).toBeCloseTo(referenceValue(m), 9);
  });

  test('5-player root value matches the reference solver (with map spread)', () => {
    expect(new DraftEngine(matrix5, null).solve()).toBeCloseTo(referenceValue(matrix5), 9);
  });

  test('additive matrices give the constant-sum value exactly (n = 3 and 5)', () => {
    const m3 = additiveMatrix([1, 2, 3], [0, -1, 4]);
    expect(new DraftEngine(m3, null).solve()).toBeCloseTo(1 + 2 + 3 + 0 - 1 + 4, 9);
    const m5 = additiveMatrix([1, 2, 3, 0, -1], [0, -1, 4, 2, -2]);
    expect(new DraftEngine(m5, null).solve()).toBeCloseTo(5 + 3, 9);
  });

  test('3-player refusal node: hand-computed payoff, no last-vs-last term', () => {
    const engine = new DraftEngine(flatMatrix(V3), null);
    engine.solve();
    const path: Move[] = [
      { stage: 'defender', my: 0, enemy: 0 },
      { stage: 'attackers', my: [1, 2], enemy: [1, 2] },
    ];
    const node = engine.nodeResult(path);
    expect(node.stage).toBe('refusal');
    // fD=0, eD=0, attackers {1,2} both sides; lastTerm absent (odd endgame):
    // AA = v[0][2]+v[2][0]+v[1][1] = -4    AB = v[0][2]+v[1][0]+v[2][1] = 2
    // BA = v[0][1]+v[2][0]+v[1][2] = -4    BB = v[0][1]+v[1][0]+v[2][2] = 10
    expect(node.why!.payoff).toEqual([[-4, 2], [-4, 10]]);
  });

  test('5-player draft end to end: rounds, forced 1x1 attackers, done', () => {
    const engine = new DraftEngine(matrix5, null);
    engine.solve();

    const root = engine.nodeResult([]);
    expect(root.stage).toBe('defender');
    expect(root.round).toBe(1);
    expect(root.choices).toHaveLength(5);

    const path: Move[] = [
      { stage: 'defender', my: 0, enemy: 0 },
      { stage: 'attackers', my: [1, 2], enemy: [1, 2] },
      { stage: 'refusal', my: 1, enemy: 1 }, // refused (mine: 1, theirs: 1) return
    ];
    const round2 = engine.nodeResult(path);
    expect(round2.stage).toBe('defender');
    expect(round2.round).toBe(2);
    expect(round2.choices).toHaveLength(3); // pool {1, 3, 4}

    path.push({ stage: 'defender', my: 1, enemy: 1 });
    const attackers = engine.nodeResult(path);
    expect(attackers.stage).toBe('attackers');
    expect(attackers.choices).toHaveLength(1); // forced pair [3, 4]
    expect(attackers.choices[0].id).toEqual([3, 4]);
    expect(attackers.choices[0].prob).toBeCloseTo(1, 9);

    path.push({ stage: 'attackers', my: [3, 4], enemy: [3, 4] });
    const refusal = engine.nodeResult(path);
    expect(refusal.stage).toBe('refusal');

    path.push({ stage: 'refusal', my: 3, enemy: 4 });
    const done = engine.nodeResult(path);
    expect(done.stage).toBe('done');
    expect(done.round).toBe(2);
  });

  test('every node strategy on a 5-player path is an equilibrium of its payoff', () => {
    const engine = new DraftEngine(matrix5, null);
    engine.solve();
    const paths: Move[][] = [
      [],
      [{ stage: 'defender', my: 0, enemy: 0 }],
      [{ stage: 'defender', my: 0, enemy: 0 }, { stage: 'attackers', my: [1, 2], enemy: [1, 2] }],
    ];
    for (const path of paths) {
      const { payoff, myStrategy, enStrategy } = engine.nodeResult(path).why!;
      const value = payoff.reduce(
        (s, row, i) => s + myStrategy[i] * row.reduce((t, aij, j) => t + aij * enStrategy[j], 0), 0);
      // No pure row deviation beats the value; no pure column goes below it.
      for (const row of payoff) {
        expect(row.reduce((t, aij, j) => t + aij * enStrategy[j], 0)).toBeLessThanOrEqual(value + 1e-9);
      }
      for (let j = 0; j < payoff[0].length; j++) {
        expect(payoff.reduce((t, row, i) => t + myStrategy[i] * row[j], 0)).toBeGreaterThanOrEqual(value - 1e-9);
      }
    }
  });
});
