import { describe, expect, test } from 'vitest';
import { fixtureMatrix, smoke } from '../conformance/fixtures';
import { DraftEngine } from '../engine/engine';
import type { Matrix } from '../engine/types';
import { achievedTotal, applyStep, finalRoundOf, initDraft } from './draftState';

function argmax(values: number[]): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i] > values[best]) best = i;
  return best;
}

describe('draftState (Smoke 4×4, exact engine)', () => {
  const matrix = fixtureMatrix(smoke);
  const engine = new DraftEngine(matrix, null, smoke.neutralWeight);
  engine.solve();

  function walk(pick: (node: ReturnType<typeof engine.nodeResult>) => number) {
    let model = initDraft(matrix, smoke.neutralWeight);
    while (!model.done) {
      const node = engine.nodeResult(model.path);
      model = applyStep(model, node, pick(node), argmax(node.why!.enStrategy));
    }
    return model;
  }

  test('a full 4×4 draft fixes exactly 4 games of the right kinds', () => {
    const model = walk((node) => argmax(node.choices.map((c) => c.prob)));
    expect(model.done).toBe(true);
    expect(model.fixed).toHaveLength(4);
    expect(model.fixed.map((g) => g.kind).sort()).toEqual(['enemy-defends', 'last', 'my-defends', 'refused']);
    // every player index appears once per side
    expect(model.fixed.map((g) => g.my).sort()).toEqual([0, 1, 2, 3]);
    expect(model.fixed.map((g) => g.enemy).sort()).toEqual([0, 1, 2, 3]);
  });

  test('each fixed game carries the correct value-model value', () => {
    const model = walk((node) => argmax(node.choices.map((c) => c.prob)));
    for (const g of model.fixed) {
      const cell = matrix.cells[g.my][g.enemy];
      const expectedValue =
        g.kind === 'my-defends' ? cell.best
        : g.kind === 'enemy-defends' ? cell.worst
        : cell.worst + smoke.neutralWeight * (cell.best - cell.worst);
      expect(g.value).toBeCloseTo(expectedValue, 9);
    }
  });

  test('following the equilibrium (argmax) leaves zero regret', () => {
    const model = walk((node) => argmax(node.choices.map((c) => c.prob)));
    for (const d of model.decisions) expect(d.regret).toBeGreaterThanOrEqual(-1e-9);
    const totalRegret = model.decisions.reduce((sum, d) => sum + d.regret, 0);
    expect(totalRegret).toBeCloseTo(0, 9);
    expect(Number.isFinite(achievedTotal(model))).toBe(true);
  });

  test('deliberately picking the worst-EV option incurs positive regret', () => {
    const model = walk((node) => argmax(node.choices.map((c) => -c.ev))); // min-ev pick
    const worstDecision = model.decisions.find((d) => d.regret > 1e-9);
    expect(worstDecision).toBeDefined();
  });
});

/** v[i][j] = a[i] + b[j], best = worst: every full pairing totals
 * sum(a) + sum(b), so achievedTotal is known without solving anything. */
function additiveMatrix(a: number[], b: number[]): Matrix {
  const n = a.length as Matrix['n'];
  return {
    n,
    myNames: Array.from({ length: n }, (_, i) => `F${i}`),
    enemyNames: Array.from({ length: n }, (_, i) => `E${i}`),
    cells: a.map((ai) => b.map((bj) => ({ best: ai + bj, worst: ai + bj }))),
  };
}

/** Drive a full draft against the real engine, always picking option 0. */
function playDraft(matrix: Matrix) {
  const engine = new DraftEngine(matrix, null);
  engine.solve();
  let model = initDraft(matrix, 0.5);
  while (!model.done) {
    model = applyStep(model, engine.nodeResult(model.path), 0, 0);
  }
  return model;
}

describe('odd team sizes', () => {
  test('finalRoundOf: odd sizes end one round earlier per parity rule', () => {
    expect(finalRoundOf(8)).toBe(3);
    expect(finalRoundOf(7)).toBe(3);
    expect(finalRoundOf(6)).toBe(2);
    expect(finalRoundOf(5)).toBe(2);
    expect(finalRoundOf(4)).toBe(1);
    expect(finalRoundOf(3)).toBe(1);
  });

  test('a 5-player draft fixes 5 games and no last-players game', () => {
    const model = playDraft(additiveMatrix([1, 2, 3, 0, -1], [0, -1, 4, 2, -2]));
    expect(model.fixed).toHaveLength(5);
    expect(model.fixed.filter((g) => g.kind === 'last')).toHaveLength(0);
    expect(model.fixed.filter((g) => g.kind === 'refused')).toHaveLength(1);
    expect(model.fixed.filter((g) => g.kind === 'my-defends')).toHaveLength(2);
    expect(model.round).toBe(2);
    expect(achievedTotal(model)).toBeCloseTo(5 + 3, 9); // constant-sum matrix
  });

  test('a 3-player draft is one round: 3 games, done', () => {
    const model = playDraft(additiveMatrix([1, 2, 3], [0, -1, 4]));
    expect(model.fixed.map((g) => g.kind).sort()).toEqual(['enemy-defends', 'my-defends', 'refused']);
    expect(achievedTotal(model)).toBeCloseTo(6 + 3, 9);
  });

  test('a 4-player draft still fixes the last-players game', () => {
    const model = playDraft(additiveMatrix([1, 2, 3, 0], [0, -1, 4, 2]));
    expect(model.fixed).toHaveLength(4);
    expect(model.fixed.filter((g) => g.kind === 'last')).toHaveLength(1);
  });
});
