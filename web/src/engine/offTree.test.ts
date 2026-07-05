/**
 * Off-tree recursion test (PR #42 review, M4): a k-restricted engine must
 * transparently solve gamestates the restriction excluded from the solved
 * tree — the trainer follows whatever moves the human actually makes.
 *
 * Correctness anchor: k saturates from the bottom up, so for a 6-player
 * matrix at k=3 every 4-player subtree is already exact. An off-tree
 * 6-player select_attackers state therefore has the SAME discard-game payoff
 * and value in the k=3 engine (solved on demand) as in the exact engine
 * (solved on the tree) — comparable to 1e-9.
 */

import { describe, expect, test } from 'vitest';
import { DraftEngine, TeamState } from './engine';
import { ROLE_NONE } from './packing';
import { fixtureMatrix, six } from '../conformance/fixtures';

const FULL = 0b111111;

function defenderState(defender: number): TeamState {
  return { mask: FULL & ~(1 << defender), defender, attackerA: ROLE_NONE, attackerB: ROLE_NONE };
}

describe('off-tree recursion (Six, k=3 vs exact)', () => {
  const restricted = new DraftEngine(fixtureMatrix(six), 3, six.neutralWeight);
  restricted.solve();
  const exact = new DraftEngine(fixtureMatrix(six), null, six.neutralWeight);
  exact.solve();

  // Both defenders = player 0. The restricted engine offers C(3,2)=3 attacker
  // pairs, the exact engine C(5,2)=10; pick a pair only the exact tree has.
  const restrictedNode = restricted.solveNode(defenderState(0), defenderState(0));
  const exactNode = exact.solveNode(defenderState(0), defenderState(0));
  const restrictedPairs = new Set(restrictedNode.game.rowOptions.map((o) => JSON.stringify(o)));
  const offPair = exactNode.game.rowOptions.find(
    (o) => !restrictedPairs.has(JSON.stringify(o))) as [number, number];

  const offState: TeamState = {
    mask: FULL & ~1 & ~(1 << offPair[0]) & ~(1 << offPair[1]),
    defender: 0,
    attackerA: offPair[0],
    attackerB: offPair[1],
  };

  test('restriction actually binds on this fixture', () => {
    expect(restrictedNode.game.m).toBe(3);
    expect(exactNode.game.m).toBe(10);
    expect(offPair).toBeDefined();
  });

  test('an off-tree select_attackers node matches the exact engine', () => {
    const before = restricted.extensionCount();
    const offRestricted = restricted.solveNode(offState, offState);
    const offExact = exact.solveNode(offState, offState);

    for (let i = 0; i < 4; i++) {
      expect(Math.abs(offRestricted.game.a[i] - offExact.game.a[i])).toBeLessThan(1e-9);
    }
    expect(Math.abs(offRestricted.solution.value - offExact.solution.value)).toBeLessThan(1e-9);

    // The on-demand values are memoised, and a repeat query is stable.
    const value = restricted.gamestateValue(offState, offState);
    expect(restricted.extensionCount()).toBeGreaterThan(before);
    expect(restricted.gamestateValue(offState, offState)).toBe(value);
    expect(Math.abs(value - offExact.solution.value)).toBeLessThan(1e-9);
  });

  test('nodeResult follows an off-tree path', () => {
    const node = restricted.nodeResult([
      { stage: 'defender', my: 0, enemy: 0 },
      { stage: 'attackers', my: offPair, enemy: offPair },
    ]);
    expect(node.stage).toBe('refusal');
    expect(node.choices.reduce((sum, choice) => sum + choice.prob, 0)).toBeCloseTo(1, 9);

    const offExact = exact.solveNode(offState, offState);
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        expect(Math.abs(node.why!.payoff[i][j] - offExact.game.a[i * 2 + j])).toBeLessThan(1e-9);
      }
    }
  });
});
