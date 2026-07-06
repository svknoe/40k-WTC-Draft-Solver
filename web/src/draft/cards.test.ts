import { describe, expect, test } from 'vitest';
import { fixtureMatrix, smoke } from '../conformance/fixtures';
import { DraftEngine } from '../engine/engine';
import { initDraft } from './draftState';
import { attackerOptions, candidateStats, pairChoiceIndex, projectedResult } from './cards';

/** Lock an arbitrary defender move to reach an attackers-stage node. */
function attackersNode() {
  const matrix = fixtureMatrix(smoke);
  const engine = new DraftEngine(matrix, null, smoke.neutralWeight);
  engine.solve();
  let model = initDraft(matrix, smoke.neutralWeight);
  const myDef = engine.nodeResult([]).choices[0].id as number;
  const enDef = model.enemyRemaining[0];
  model = { ...model, myDefender: myDef, enemyDefender: enDef, path: [{ stage: 'defender', my: myDef, enemy: enDef }] };
  return { matrix, model, myDef, enDef, node: engine.nodeResult(model.path) };
}

describe('candidateStats', () => {
  test('defender stage: avg + floor of my row over enemy remaining (best map)', () => {
    const matrix = fixtureMatrix(smoke);
    const model = initDraft(matrix, smoke.neutralWeight);
    const engine = new DraftEngine(matrix, null, smoke.neutralWeight);
    engine.solve();
    const node = engine.nodeResult([]);

    const s = candidateStats(model, node, 0);
    const my = node.choices[0].id as number;
    const vals = model.enemyRemaining.map((e) => matrix.cells[my][e].best + 10); // → 0–20
    expect(s.floor).toBe(Math.min(...vals));
    expect(s.avg).toBe(Math.round(vals.reduce((a, b) => a + b, 0) / vals.length));
  });

  test('attackers stage: worst-map values of the pair vs their defender', () => {
    const matrix = fixtureMatrix(smoke);
    const engine = new DraftEngine(matrix, null, smoke.neutralWeight);
    engine.solve();

    let model = initDraft(matrix, smoke.neutralWeight);
    const root = engine.nodeResult([]);
    // Lock a defender move to reach the attackers node.
    const myDef = root.choices[0].id as number;
    const enDef = model.enemyRemaining[0];
    model = {
      ...model,
      myDefender: myDef,
      enemyDefender: enDef,
      path: [{ stage: 'defender', my: myDef, enemy: enDef }],
    };
    const node = engine.nodeResult(model.path);

    const s = candidateStats(model, node, 0);
    const [a, b] = node.choices[0].id as [number, number];
    const vals = [matrix.cells[a][enDef].worst + 10, matrix.cells[b][enDef].worst + 10];
    expect(s.floor).toBe(Math.min(...vals));
    expect(s.avg).toBe(Math.round((vals[0] + vals[1]) / 2));
  });
});

describe('attackerOptions', () => {
  test('one option per eligible attacker, worst-map rating, marginal send-prob', () => {
    const { matrix, model, myDef, enDef, node } = attackersNode();
    const opts = attackerOptions(model, node);

    // Eligible attackers = my remaining minus my defender, ascending.
    const eligible = model.myRemaining.filter((x) => x !== myDef).sort((a, b) => a - b);
    expect(opts.map((o) => o.index)).toEqual(eligible);

    for (const o of opts) {
      // Rating = worst-map value vs the enemy defender, on the 0–20 scale.
      expect(o.rating).toBe(matrix.cells[o.index][enDef].worst + 10);
      // Marginal = summed prob of every offered pair containing the attacker.
      const marginal = node.choices
        .filter((c) => (c.id as [number, number]).includes(o.index))
        .reduce((s, c) => s + c.prob, 0);
      expect(o.sendProb).toBeCloseTo(marginal, 12);
    }
    // Two attackers are sent, so the marginals total 2.
    expect(opts.reduce((s, o) => s + o.sendProb, 0)).toBeCloseTo(2, 6);
  });

  test('empty off the attackers stage', () => {
    const matrix = fixtureMatrix(smoke);
    const model = initDraft(matrix, smoke.neutralWeight);
    const engine = new DraftEngine(matrix, null, smoke.neutralWeight);
    engine.solve();
    expect(attackerOptions(model, engine.nodeResult([]))).toEqual([]); // a defender node
  });
});

describe('pairChoiceIndex', () => {
  test('matches an offered pair either order; −1 when the pair is not offered', () => {
    const { model, myDef, node } = attackersNode();
    const [a, b] = node.choices[0].id as [number, number];
    expect(pairChoiceIndex(node, a, b)).toBe(0);
    expect(pairChoiceIndex(node, b, a)).toBe(0); // order-independent
    expect(pairChoiceIndex(node, myDef, model.myRemaining.filter((x) => x !== myDef)[0])).toBe(-1);
  });
});

describe('projectedResult', () => {
  test('at the root, projected equals expected (delta ~0)', () => {
    const matrix = fixtureMatrix(smoke);
    const model = initDraft(matrix, smoke.neutralWeight);
    const engine = new DraftEngine(matrix, null, smoke.neutralWeight);
    const expected = engine.solve();
    const node = engine.nodeResult([]);

    const { projected, delta } = projectedResult(model, node, expected);
    // At the root nothing is fixed yet, so projected = best continuation ev.
    // The best pure response against the equilibrium mix equals the game value.
    expect(projected).toBeCloseTo(expected, 6);
    expect(delta).toBeCloseTo(0, 6);
  });
});
