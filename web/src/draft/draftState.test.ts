import { describe, expect, test } from 'vitest';
import { fixtureMatrix, smoke } from '../conformance/fixtures';
import { DraftEngine } from '../engine/engine';
import { achievedTotal, applyStep, initDraft } from './draftState';

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
