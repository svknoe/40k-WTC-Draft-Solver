import { describe, expect, test } from 'vitest';
import { fixtureMatrix, smoke } from '../conformance/fixtures';
import { DraftEngine } from '../engine/engine';
import { initDraft } from './draftState';
import { candidateStats, projectedResult, topThreats } from './cards';

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

describe('topThreats', () => {
  test('defender stage: top-k enemy remaining by equilibrium weight, descending', () => {
    const matrix = fixtureMatrix(smoke);
    const model = initDraft(matrix, smoke.neutralWeight);
    const engine = new DraftEngine(matrix, null, smoke.neutralWeight);
    engine.solve();
    const node = engine.nodeResult([]);

    const threats = topThreats(model, node, 2);
    expect(threats.length).toBeLessThanOrEqual(2);
    const weights = threats.map((t) => t.weight);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights); // already descending
    expect(model.enemyRemaining).toContain(threats[0].enemyIndex);
  });

  test('non-defender stages return no threats', () => {
    const matrix = fixtureMatrix(smoke);
    const engine = new DraftEngine(matrix, null, smoke.neutralWeight);
    engine.solve();
    let model = initDraft(matrix, smoke.neutralWeight);
    const root = engine.nodeResult([]);
    const myDef = root.choices[0].id as number;
    const enDef = model.enemyRemaining[0];
    model = { ...model, myDefender: myDef, enemyDefender: enDef, path: [{ stage: 'defender', my: myDef, enemy: enDef }] };
    const node = engine.nodeResult(model.path);
    expect(topThreats(model, node)).toEqual([]);
  });
});
