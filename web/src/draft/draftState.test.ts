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

  test('a 7-player draft runs 3 rounds and returns refused attackers to the pool', () => {
    const model = playDraft(additiveMatrix([1, 2, 3, 0, -1, 2, -2], [0, -1, 4, 2, -2, 1, 3]));
    expect(model.fixed).toHaveLength(7);
    expect(model.fixed.filter((g) => g.kind === 'last')).toHaveLength(0);
    expect(model.fixed.filter((g) => g.kind === 'refused')).toHaveLength(1);
    expect(model.fixed.filter((g) => g.kind === 'my-defends')).toHaveLength(3);
    expect(model.round).toBe(3);
    expect(achievedTotal(model)).toBeCloseTo(5 + 7, 9); // constant-sum matrix
  });

  test('a corrupted even-size pool throws instead of silently dropping the last game', () => {
    const matrix = additiveMatrix([1, 2, 3, 0], [0, -1, 4, 2]);
    const engine = new DraftEngine(matrix, null);
    engine.solve();
    let model = initDraft(matrix, 0.5);
    model = applyStep(model, engine.nodeResult(model.path), 0, 0); // defenders
    model = applyStep(model, engine.nodeResult(model.path), 0, 0); // attackers
    // Remove the would-be last player (not defender, not a sent attacker),
    // then resolve the final refusal on the corrupted model.
    const lastPlayer = model.myRemaining.find(
      (x) => x !== model.myDefender && !model.myPair!.includes(x))!;
    const corrupted = { ...model, myRemaining: model.myRemaining.filter((x) => x !== lastPlayer) };
    expect(() => applyStep(corrupted, engine.nodeResult(model.path), 0, 0)).toThrow(/last players/);
  });
});

describe('two-player mode', () => {
  const matrix = fixtureMatrix(smoke);
  const engine = new DraftEngine(matrix, null, smoke.neutralWeight);
  const expected = engine.solve();

  /** The enemy's per-column EV vs my equilibrium mix, from MY perspective. */
  const colEvs = (node: ReturnType<typeof engine.nodeResult>): number[] => {
    const { payoff, myStrategy } = node.why!;
    return payoff[0].map((_, j) => payoff.reduce((s, row, i) => s + myStrategy[i] * row[j], 0));
  };

  test('initDraft defaults to bot mode: twoPlayer false, empty enemy decision log', () => {
    const model = initDraft(matrix, smoke.neutralWeight);
    expect(model.twoPlayer).toBe(false);
    expect(model.enemyDecisions).toEqual([]);
  });

  test('bot mode never logs enemy decisions', () => {
    let model = initDraft(matrix, smoke.neutralWeight);
    while (!model.done) model = applyStep(model, engine.nodeResult(model.path), 0, 0);
    expect(model.enemyDecisions).toEqual([]);
  });

  test('2P logs one enemy decision per step, EVs in the enemy perspective', () => {
    let model = initDraft(matrix, smoke.neutralWeight, true);
    expect(model.twoPlayer).toBe(true);
    let steps = 0;
    while (!model.done) {
      const node = engine.nodeResult(model.path);
      const evs = colEvs(node);
      const round = model.round;
      model = applyStep(model, node, 0, 1); // arbitrary picks: my option 0, enemy column 1
      steps++;
      expect(model.enemyDecisions).toHaveLength(steps);
      const d = model.enemyDecisions[steps - 1];
      expect(d.stage).toBe(node.stage);
      expect(d.round).toBe(round);
      expect(d.chosenEv).toBeCloseTo(-evs[1], 9);
      expect(d.bestEv).toBeCloseTo(Math.max(...evs.map((v) => -v)), 9);
      expect(d.regret).toBeCloseTo(d.bestEv - d.chosenEv, 9);
      expect(d.regret).toBeGreaterThanOrEqual(-1e-9);
    }
    expect(model.decisions).toHaveLength(steps); // friendly log unaffected
  });

  test('an enemy playing argmax(enStrategy) leaves ~zero enemy regret', () => {
    let model = initDraft(matrix, smoke.neutralWeight, true);
    while (!model.done) {
      const node = engine.nodeResult(model.path);
      model = applyStep(
        model, node,
        argmax(node.choices.map((c) => c.prob)),
        argmax(node.why!.enStrategy),
      );
    }
    const total = model.enemyDecisions.reduce((s, d) => s + d.regret, 0);
    expect(total).toBeCloseTo(0, 6);
    expect(Number.isFinite(expected)).toBe(true);
  });

  test('enemy decision names: defender stage names their player, refusal the kept friendly attacker', () => {
    let model = initDraft(matrix, smoke.neutralWeight, true);
    const defenderCol = 1;
    const expectedDefender = matrix.enemyNames[model.enemyRemaining[defenderCol]];
    model = applyStep(model, engine.nodeResult(model.path), 0, defenderCol);
    expect(model.enemyDecisions[0].chosenName).toBe(expectedDefender);

    model = applyStep(model, engine.nodeResult(model.path), 0, 0); // attackers
    const myPair = model.myPair!;
    model = applyStep(model, engine.nodeResult(model.path), 0, 0); // they refuse myPair[0]
    const refusal = model.enemyDecisions[2];
    expect(refusal.chosenName).toBe(matrix.myNames[myPair[1]]); // faced = the kept one
  });
});
