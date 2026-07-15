import { describe, expect, test } from 'vitest';
import type { DraftDecision } from './draftState';
import { decompose, decompose2p, verdict, verdict2p } from './summary';

function decision(regret: number): DraftDecision {
  return {
    stage: 'attackers', round: 1,
    chosenId: [0, 1], chosenName: ['A', 'B'], chosenEv: 5 - regret,
    bestEv: 5, bestName: ['A', 'C'], regret,
  };
}

describe('decompose (§3.4)', () => {
  test('splits the delta into regret (my picks) and variance (reveal luck)', () => {
    const d = decompose([decision(0), decision(2), decision(0)], 5, 4);
    expect(d.totalRegret).toBeCloseTo(2, 9);
    expect(d.totalDelta).toBeCloseTo(-1, 9); // achieved 4 − expected 5
    expect(d.variance).toBeCloseTo(1, 9); // totalDelta + Σregret = −1 + 2
    expect(d.leaks).toHaveLength(1);
    expect(d.leaks[0].regret).toBe(2);
  });

  test('the decomposition sums exactly: achieved = expected + variance − Σregret', () => {
    const d = decompose([decision(1.5), decision(0.5)], 6.2, 3.1);
    expect(d.expected + d.variance - d.totalRegret).toBeCloseTo(d.achieved, 9);
  });

  test('clamps tiny negative regrets (LP tolerance) to zero', () => {
    const d = decompose([decision(-1e-12)], 5, 5);
    expect(d.totalRegret).toBe(0);
    expect(d.leaks).toHaveLength(0);
  });
});

describe('verdict', () => {
  test('clean draft credits/blames variance, never the bot', () => {
    const clean = decompose([decision(0)], 5, 3); // regret 0, variance −2
    expect(verdict(83, 77, clean).summary).toMatch(/unlucky reveals/i);

    const onPlan = decompose([decision(0)], 5, 5);
    expect(verdict(85, 75, onPlan).summary).toMatch(/went to plan/i);

    const lucky = decompose([decision(0)], 5, 8);
    expect(verdict(88, 72, lucky).summary).toMatch(/broke your way|reveals/i);
  });

  test('a leaky draft says the picks cost points', () => {
    const leaky = decompose([decision(3)], 5, 2);
    expect(verdict(82, 78, leaky).summary).toMatch(/picks cost/i);
    expect(verdict(82, 78, leaky).summary).not.toMatch(/out-drafted/i);
  });

  test('result label reflects the achieved margin', () => {
    const d = decompose([], 0, 0);
    expect(verdict(120, 40, d).result).toBe('CRUSHING WIN');
    expect(verdict(86, 74, d).result).toBe('CLOSE WIN');
    expect(verdict(80, 80, d).result).toBe('DEAD DRAW');
    expect(verdict(70, 90, d).result).toBe('LARGE LOSS');
  });
});

describe('decompose2p (two-player mode)', () => {
  test('splits into per-seat regret and reveal luck; the identity holds exactly', () => {
    const d = decompose2p([decision(2), decision(0)], [decision(1)], 5, 3);
    expect(d.myRegret).toBeCloseTo(2, 9);
    expect(d.enemyRegret).toBeCloseTo(1, 9);
    expect(d.totalDelta).toBeCloseTo(-2, 9); // achieved 3 − expected 5
    expect(d.revealLuck).toBeCloseTo(-1, 9); // −2 + 2 − 1
    // achieved = expected − myRegret + enemyRegret + revealLuck, exactly.
    expect(d.expected - d.myRegret + d.enemyRegret + d.revealLuck).toBeCloseTo(d.achieved, 9);
    expect(d.myLeaks).toHaveLength(1);
    expect(d.enemyLeaks).toHaveLength(1);
  });

  test('clamps tiny negative regrets and sorts each seat\'s leaks worst-first', () => {
    const d = decompose2p([decision(-1e-12)], [decision(1), decision(3)], 0, 0);
    expect(d.myRegret).toBe(0);
    expect(d.myLeaks).toHaveLength(0);
    expect(d.enemyLeaks.map((l) => l.regret)).toEqual([3, 1]);
  });
});

describe('verdict2p', () => {
  test('both seats clean credits the reveals, never a picks cost', () => {
    const d = decompose2p([decision(0)], [decision(0)], 5, 3);
    expect(verdict2p(83, 77, d).summary).toMatch(/reveals/i);
    expect(verdict2p(83, 77, d).summary).not.toMatch(/cost/i);

    const onPlan = decompose2p([decision(0)], [decision(0)], 5, 5);
    expect(verdict2p(85, 75, onPlan).summary).toMatch(/to plan/i);
  });

  test('leaky seats are named with their costs', () => {
    const both = decompose2p([decision(2)], [decision(3)], 5, 5);
    expect(verdict2p(80, 80, both).summary).toMatch(/your picks cost 2\.0/i);
    expect(verdict2p(80, 80, both).summary).toMatch(/3\.0/);

    const mineOnly = decompose2p([decision(2)], [decision(0)], 5, 5);
    expect(verdict2p(80, 80, mineOnly).summary).toMatch(/your picks cost/i);

    const theirsOnly = decompose2p([decision(0)], [decision(2)], 5, 5);
    expect(verdict2p(80, 80, theirsOnly).summary).toMatch(/opponent/i);
  });

  test('result label uses the same bands as the bot mode', () => {
    const d = decompose2p([], [], 0, 0);
    expect(verdict2p(120, 40, d).result).toBe('CRUSHING WIN');
    expect(verdict2p(80, 80, d).result).toBe('DEAD DRAW');
  });
});
