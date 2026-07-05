import { describe, expect, test } from 'vitest';
import type { DraftDecision } from './draftState';
import { decompose, verdict } from './summary';

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
