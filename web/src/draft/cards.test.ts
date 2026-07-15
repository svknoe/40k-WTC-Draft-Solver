import { describe, expect, test } from 'vitest';
import { fixtureMatrix, smoke } from '../conformance/fixtures';
import { DraftEngine } from '../engine/engine';
import { applyStep, enemyMoveId, initDraft } from './draftState';
import {
  attackerOptions,
  candidateStats,
  enemyAttackerOptions,
  enemyCandidateStats,
  enemyChoices,
  enemyPairColIndex,
  pairChoiceIndex,
  projectedResult,
} from './cards';

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

/** Lock defender + attackers moves (always option/column 0) to reach a
 * refusal-stage node. */
function refusalNode() {
  const matrix = fixtureMatrix(smoke);
  const engine = new DraftEngine(matrix, null, smoke.neutralWeight);
  engine.solve();
  let model = initDraft(matrix, smoke.neutralWeight);
  model = applyStep(model, engine.nodeResult([]), 0, 0);
  model = applyStep(model, engine.nodeResult(model.path), 0, 0);
  return { matrix, model, node: engine.nodeResult(model.path) };
}

describe('enemyChoices', () => {
  test('defender root: one per column, id/name decoded, prob = enStrategy, ev negated', () => {
    const matrix = fixtureMatrix(smoke);
    const model = initDraft(matrix, smoke.neutralWeight);
    const engine = new DraftEngine(matrix, null, smoke.neutralWeight);
    engine.solve();
    const node = engine.nodeResult([]);

    const opts = enemyChoices(model, node);
    const { payoff, myStrategy, enStrategy } = node.why!;
    expect(opts.map((o) => o.id)).toEqual(model.enemyRemaining);
    opts.forEach((o, j) => {
      expect(o.name).toBe(matrix.enemyNames[model.enemyRemaining[j]]);
      expect(o.prob).toBe(enStrategy[j]);
      const myEv = payoff.reduce((s, row, i) => s + myStrategy[i] * row[j], 0);
      expect(o.ev).toBeCloseTo(-myEv, 12);
    });
  });

  test('attackers stage: ids are their eligible pairs in column order, names paired', () => {
    const { matrix, model, node } = attackersNode2();
    const opts = enemyChoices(model, node);
    expect(opts).toHaveLength(node.why!.enStrategy.length);
    opts.forEach((o, j) => {
      expect(o.id).toEqual(enemyMoveId(model, 'attackers', j));
      const [a, b] = o.id as [number, number];
      expect(o.name).toEqual([matrix.enemyNames[a], matrix.enemyNames[b]]);
    });
  });

  test('refusal stage: ids are my sent pair (the friendly attacker they refuse)', () => {
    const { matrix, model, node } = refusalNode();
    const opts = enemyChoices(model, node);
    expect(opts.map((o) => o.id)).toEqual([...model.myPair!]);
    expect(opts.map((o) => o.name)).toEqual(model.myPair!.map((x) => matrix.myNames[x]));
  });

  const joinName = (name: string | [string, string]): string =>
    typeof name === 'string' ? name : `${name[0]} + ${name[1]}`;

  test('reconstructed column labels match the engine colLabels at every stage', () => {
    for (const reach of [attackersNode2, refusalNode]) {
      const { model, node } = reach();
      expect(enemyChoices(model, node).map((o) => joinName(o.name))).toEqual(node.why!.colLabels);
    }
    // defender root too
    const matrix = fixtureMatrix(smoke);
    const engine = new DraftEngine(matrix, null, smoke.neutralWeight);
    engine.solve();
    const root = engine.nodeResult([]);
    expect(enemyChoices(initDraft(matrix, smoke.neutralWeight), root).map((o) => joinName(o.name)))
      .toEqual(root.why!.colLabels);
  });

  test('tripwire throws if the column enumeration diverges from the engine', () => {
    const { model, node } = attackersNode2();
    // Simulate a k-restriction reordering: swap two colLabels so the ascending
    // reconstruction no longer matches the engine's column order.
    const labels = [...node.why!.colLabels];
    [labels[0], labels[1]] = [labels[1], labels[0]];
    const skewed = { ...node, why: { ...node.why!, colLabels: labels } };
    expect(() => enemyChoices(model, skewed)).toThrow(/exact solve/i);
  });
});

/** attackersNode variant that keeps model/node/matrix together via applyStep. */
function attackersNode2() {
  const matrix = fixtureMatrix(smoke);
  const engine = new DraftEngine(matrix, null, smoke.neutralWeight);
  engine.solve();
  let model = initDraft(matrix, smoke.neutralWeight);
  model = applyStep(model, engine.nodeResult([]), 0, 0);
  return { matrix, model, node: engine.nodeResult(model.path) };
}

describe('enemyCandidateStats', () => {
  test('defender stage: their avg + floor over my remaining pool (their best map = my worst)', () => {
    const matrix = fixtureMatrix(smoke);
    const model = initDraft(matrix, smoke.neutralWeight);
    const engine = new DraftEngine(matrix, null, smoke.neutralWeight);
    engine.solve();
    const node = engine.nodeResult([]);

    const j = 1;
    const s = enemyCandidateStats(model, node, j);
    const e = model.enemyRemaining[j];
    // Their score for an enemy-defends game = 20 − my worst-map score.
    const vals = model.myRemaining.map((m) => 20 - (matrix.cells[m][e].worst + 10));
    expect(s.floor).toBe(Math.min(...vals));
    expect(s.avg).toBe(Math.round(vals.reduce((a, b) => a + b, 0) / vals.length));
  });

  test('attackers stage: their pair vs my defender, flipped best-map values', () => {
    const { matrix, model, node } = attackersNode2();
    const s = enemyCandidateStats(model, node, 0);
    const [a, b] = enemyMoveId(model, 'attackers', 0) as [number, number];
    const d = model.myDefender;
    const vals = [20 - (matrix.cells[d][a].best + 10), 20 - (matrix.cells[d][b].best + 10)];
    expect(s.floor).toBe(Math.min(...vals));
    expect(s.avg).toBe(Math.round((vals[0] + vals[1]) / 2));
  });

  test('refusal stage: the kept friendly attacker vs their defender, avg === floor', () => {
    const { matrix, model, node } = refusalNode();
    const s = enemyCandidateStats(model, node, 0); // they refuse myPair[0], keep myPair[1]
    const kept = model.myPair![1];
    const v = 20 - (matrix.cells[kept][model.enemyDefender].worst + 10);
    expect(s.avg).toBe(v);
    expect(s.floor).toBe(v);
  });
});

describe('enemyAttackerOptions', () => {
  test('one per their eligible attacker, flipped rating vs my defender, marginals total 2', () => {
    const { matrix, model, node } = attackersNode2();
    const opts = enemyAttackerOptions(model, node);

    const eligible = model.enemyRemaining.filter((x) => x !== model.enemyDefender).sort((a, b) => a - b);
    expect(opts.map((o) => o.index)).toEqual(eligible);

    const en = node.why!.enStrategy;
    for (const o of opts) {
      expect(o.rating).toBe(20 - (matrix.cells[model.myDefender][o.index].best + 10));
      const marginal = en.reduce((s, p, j) => {
        const pair = enemyMoveId(model, 'attackers', j) as [number, number];
        return pair.includes(o.index) ? s + p : s;
      }, 0);
      expect(o.sendProb).toBeCloseTo(marginal, 12);
    }
    expect(opts.reduce((s, o) => s + o.sendProb, 0)).toBeCloseTo(2, 6);
  });

  test('empty off the attackers stage', () => {
    const matrix = fixtureMatrix(smoke);
    const model = initDraft(matrix, smoke.neutralWeight);
    const engine = new DraftEngine(matrix, null, smoke.neutralWeight);
    engine.solve();
    expect(enemyAttackerOptions(model, engine.nodeResult([]))).toEqual([]);
  });
});

describe('enemyPairColIndex', () => {
  test('round-trips every column either order; −1 for a pair that is not offered', () => {
    const { model, node } = attackersNode2();
    for (let j = 0; j < node.why!.enStrategy.length; j++) {
      const [a, b] = enemyMoveId(model, 'attackers', j) as [number, number];
      expect(enemyPairColIndex(model, a, b)).toBe(j);
      expect(enemyPairColIndex(model, b, a)).toBe(j);
    }
    const eligible = model.enemyRemaining.filter((x) => x !== model.enemyDefender);
    expect(enemyPairColIndex(model, model.enemyDefender, eligible[0])).toBe(-1);
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
