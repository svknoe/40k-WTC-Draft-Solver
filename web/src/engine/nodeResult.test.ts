/**
 * Trainer-path test: walk a full draft through nodeResult (the §3.3 payload)
 * on the 4-player Smoke fixture, both sides following their equilibrium
 * argmax, and check the invariants the trainer relies on.
 */

import { describe, expect, test } from 'vitest';
import { DraftEngine } from './engine';
import { Move, NodeResult } from './types';
import { fixtureMatrix, smoke } from '../conformance/fixtures';

function argmax(values: number[]): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i] > values[best]) best = i;
  return best;
}

function checkChoiceInvariants(node: NodeResult, expected: number): void {
  const probSum = node.choices.reduce((sum, choice) => sum + choice.prob, 0);
  expect(probSum).toBeCloseTo(1, 9);

  // Every played (prob > 0) choice of an equilibrium mix earns exactly the
  // node value against the opponent's mix; unplayed choices earn at most it.
  // The root node's value is the solve's expected result.
  const value = node.choices.reduce((sum, choice) => sum + choice.prob * choice.ev, 0);
  for (const choice of node.choices) {
    expect(choice.ev).toBeLessThanOrEqual(value + 1e-9);
    if (choice.prob > 1e-9) expect(choice.ev).toBeCloseTo(value, 9);
  }
  if (node.round === 1 && node.stage === 'defender') {
    expect(value).toBeCloseTo(expected, 9);
  }
}

describe('nodeResult draft walk (Smoke, exact)', () => {
  const engine = new DraftEngine(fixtureMatrix(smoke), null, smoke.neutralWeight);
  const expected = engine.solve();

  test('defender -> attackers -> refusal -> done, equilibrium argmax on both sides', () => {
    const path: Move[] = [];

    const root = engine.nodeResult(path);
    expect(root.stage).toBe('defender');
    expect(root.round).toBe(1);
    expect(root.choices).toHaveLength(4);
    expect(root.why).not.toBeNull();
    checkChoiceInvariants(root, expected);

    // Defender stage: my id from choices, enemy id from the why panel's
    // column mix over the enemy's remaining players (ascending, like rows).
    const myDefender = root.choices[argmax(root.choices.map((c) => c.prob))].id as number;
    const enemyDefender = argmax(root.why!.enStrategy);
    path.push({ stage: 'defender', my: myDefender, enemy: enemyDefender });

    const attackersNode = engine.nodeResult(path);
    expect(attackersNode.stage).toBe('attackers');
    expect(attackersNode.choices).toHaveLength(3); // C(3,2) pairs
    checkChoiceInvariants(attackersNode, expected);

    const myPair = attackersNode.choices[argmax(attackersNode.choices.map((c) => c.prob))]
      .id as [number, number];
    // Enemy pairs enumerate exactly like mine; recover the id by index.
    const enemyRemaining = [0, 1, 2, 3].filter((p) => p !== enemyDefender);
    const enemyPairs: [number, number][] = [];
    for (let i = 0; i < enemyRemaining.length - 1; i++) {
      for (let j = i + 1; j < enemyRemaining.length; j++) {
        enemyPairs.push([enemyRemaining[i], enemyRemaining[j]]);
      }
    }
    const enemyPair = enemyPairs[argmax(attackersNode.why!.enStrategy)];
    path.push({ stage: 'attackers', my: myPair, enemy: enemyPair });

    const refusalNode = engine.nodeResult(path);
    expect(refusalNode.stage).toBe('refusal');
    expect(refusalNode.choices).toHaveLength(2);
    // My refusal options are the ENEMY attackers just sent.
    expect((refusalNode.choices.map((c) => c.id) as number[]).sort()).toEqual([...enemyPair].sort());
    checkChoiceInvariants(refusalNode, expected);

    const myRefusal = refusalNode.choices[argmax(refusalNode.choices.map((c) => c.prob))].id as number;
    const enemyRefusal = myPair[argmax(refusalNode.why!.enStrategy)];
    path.push({ stage: 'refusal', my: myRefusal, enemy: enemyRefusal });

    const done = engine.nodeResult(path);
    expect(done.stage).toBe('done');
    expect(done.choices).toHaveLength(0);
    expect(done.why).toBeNull();
  });

  test('invalid moves throw', () => {
    expect(() => engine.nodeResult([{ stage: 'attackers', my: [0, 1], enemy: [0, 1] }]))
      .toThrow(/Expected a 'defender' move/);
    expect(() => engine.nodeResult([{ stage: 'defender', my: 9, enemy: 0 }])).toThrow(/not available/);
  });
});
