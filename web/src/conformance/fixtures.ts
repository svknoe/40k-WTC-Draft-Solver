/** Typed access to the conformance fixtures exported from the Python engine
 * (scripts/export_conformance_fixtures.py) — the anti-drift guard of
 * docs/web-design.md §7.2. Regenerate the JSONs whenever the value model
 * changes; never edit them by hand. */

import { Matrix } from '../engine/types';
import smokeJson from './fixtures/smoke.json';
import sixJson from './fixtures/six.json';
import scotlandJson from './fixtures/scotland.json';

export interface FixtureTeamState {
  remaining: number[];
  defender: number | null;
  attackerA: number | null;
  attackerB: number | null;
}

export interface FixtureNode {
  stage: 'none' | 'select_defender' | 'select_attackers';
  state: { friendly: FixtureTeamState; enemy: FixtureTeamState };
  rowLabels: (number | [number, number])[];
  colLabels: (number | [number, number])[];
  payoff: number[][];
  value: number;
  rowStrategy: number[];
  colStrategy: number[];
}

export interface FixtureSolve {
  k: number | null;
  stageCounts: Record<string, number>;
  expectedValue: number;
  sampleNodes: FixtureNode[];
  pythonSolveSeconds: number;
}

export interface Fixture {
  team: string;
  n: 4 | 6 | 8;
  myNames: string[];
  enemyNames: string[];
  cellsBest: number[][];
  cellsWorst: number[][];
  neutralWeight: number;
  solves: FixtureSolve[];
}

export const smoke = smokeJson as unknown as Fixture;
export const six = sixJson as unknown as Fixture;
export const scotland = scotlandJson as unknown as Fixture;

export function fixtureMatrix(fixture: Fixture): Matrix {
  return {
    n: fixture.n,
    myNames: fixture.myNames,
    enemyNames: fixture.enemyNames,
    cells: fixture.cellsBest.map((row, i) =>
      row.map((best, j) => ({ best, worst: fixture.cellsWorst[i][j] }))),
  };
}
