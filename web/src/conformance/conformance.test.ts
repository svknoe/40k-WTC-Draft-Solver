/**
 * Conformance suite: the TS engine against frozen fixtures exported from the
 * retired Python engine (docs/web-design.md §7.2 — "conformance, not
 * bit-equality"; last exporter source: git tag v-final-pre-python-removal).
 *
 * - Game VALUES are unique per zero-sum game and must agree to ~1e-9.
 * - Gamestate counts per (n, stage) must match exactly (pins the enumeration
 *   and the k-restriction heuristic's eligible-attacker ranking).
 * - Sample-node payoff matrices and option labels must match (pins option
 *   enumeration order).
 * - Mixed STRATEGIES are not unique (degenerate games have many equilibria),
 *   so both engines' strategies are asserted as epsilon-equilibria of the
 *   shared payoff matrix rather than compared entry-wise.
 *
 * Scotland k=4 and exact are multi-second solves gated behind
 * CONFORMANCE_SLOW=1 (web CI sets it; local `npm test` stays fast).
 */

import { describe, expect, test } from 'vitest';
import { DraftEngine, TeamState } from '../engine/engine';
import { ROLE_NONE } from '../engine/packing';
import {
  Fixture, FixtureNode, FixtureSolve, FixtureTeamState,
  fixtureMatrix, smoke, six, scotland,
} from './fixtures';

const VALUE_TOLERANCE = 1e-9;
// The TS solver's own strategies must support its value almost exactly; the
// Python fixture strategies come out of HiGHS, whose feasibility tolerances
// are looser, so they get a correspondingly looser sanity bound.
const TS_EQUILIBRIUM_TOLERANCE = 1e-9;
const PYTHON_EQUILIBRIUM_TOLERANCE = 1e-6;

const SLOW = process.env.CONFORMANCE_SLOW === '1';

function toTeamState(state: FixtureTeamState): TeamState {
  let mask = 0;
  for (const player of state.remaining) mask |= 1 << player;
  return {
    mask,
    defender: state.defender ?? ROLE_NONE,
    attackerA: state.attackerA ?? ROLE_NONE,
    attackerB: state.attackerB ?? ROLE_NONE,
  };
}

/** Assert (row, col) is an equilibrium of `payoff` with value `value`: both
 * are distributions, the row mix guarantees >= value against every column,
 * and the column mix concedes <= value against every row. */
function expectEquilibrium(
  payoff: number[][], row: number[], col: number[], value: number, tolerance: number,
): void {
  const m = payoff.length;
  const n = payoff[0].length;

  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  expect(sum(row)).toBeCloseTo(1, 9);
  expect(sum(col)).toBeCloseTo(1, 9);
  for (const p of row) expect(p).toBeGreaterThanOrEqual(-tolerance);
  for (const p of col) expect(p).toBeGreaterThanOrEqual(-tolerance);

  for (let j = 0; j < n; j++) {
    let guaranteed = 0;
    for (let i = 0; i < m; i++) guaranteed += row[i] * payoff[i][j];
    expect(guaranteed).toBeGreaterThanOrEqual(value - tolerance);
  }
  for (let i = 0; i < m; i++) {
    let conceded = 0;
    for (let j = 0; j < n; j++) conceded += col[j] * payoff[i][j];
    expect(conceded).toBeLessThanOrEqual(value + tolerance);
  }
}

function checkSampleNode(engine: DraftEngine, node: FixtureNode): void {
  const { game, solution } = engine.solveNode(
    toTeamState(node.state.friendly), toTeamState(node.state.enemy));

  // Same option labels in the same order (pins enumeration + restriction).
  expect(game.rowOptions).toEqual(node.rowLabels);
  expect(game.colOptions).toEqual(node.colLabels);

  // Same payoff matrix (child values agree all the way down).
  expect(game.m).toBe(node.payoff.length);
  expect(game.n).toBe(node.payoff[0].length);
  for (let i = 0; i < game.m; i++) {
    for (let j = 0; j < game.n; j++) {
      expect(Math.abs(game.a[i * game.n + j] - node.payoff[i][j])).toBeLessThan(VALUE_TOLERANCE);
    }
  }

  expect(Math.abs(solution.value - node.value)).toBeLessThan(VALUE_TOLERANCE);

  const payoff = node.payoff;
  expectEquilibrium(payoff, solution.row, solution.col, node.value, TS_EQUILIBRIUM_TOLERANCE);
  expectEquilibrium(payoff, node.rowStrategy, node.colStrategy, node.value, PYTHON_EQUILIBRIUM_TOLERANCE);
}

function checkSolve(fixture: Fixture, solve: FixtureSolve): void {
  const engine = new DraftEngine(fixtureMatrix(fixture), solve.k, fixture.neutralWeight);
  const expected = engine.solve();

  expect(engine.stageCounts()).toEqual(solve.stageCounts);
  expect(Math.abs(expected - solve.expectedValue)).toBeLessThan(VALUE_TOLERANCE);

  for (const node of solve.sampleNodes) checkSampleNode(engine, node);
}

function describeFixture(fixture: Fixture, slowKs: (number | null)[] = []): void {
  describe(fixture.team, () => {
    for (const solve of fixture.solves) {
      const slow = slowKs.some((k) => k === solve.k);
      test.skipIf(slow && !SLOW)(
        `k=${solve.k ?? 'exact'} matches the Python engine`,
        { timeout: 600_000 },
        () => checkSolve(fixture, solve),
      );
    }
  });
}

describeFixture(smoke);
describeFixture(six);
describeFixture(scotland, [4, null]);
