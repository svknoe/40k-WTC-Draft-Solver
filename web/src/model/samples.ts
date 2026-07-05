import { fixtureMatrix, scotland, six, smoke } from '../conformance/fixtures';
import type { Fixture } from '../conformance/fixtures';
import type { EditorMatrix } from './matrix';
import { toInputString } from './scale';

/** Seed the editor from a conformance fixture (a known-good, solvable matrix),
 * converting the internal-scale cells back to 0-20 score strings. */
function fromFixture(fixture: Fixture, myTeam: string, enemyTeam: string): EditorMatrix {
  const m = fixtureMatrix(fixture);
  return {
    n: m.n,
    myTeam,
    enemyTeam,
    myNames: [...m.myNames],
    enemyNames: [...m.enemyNames],
    cells: m.cells.map((row) =>
      row.map((c) => ({ b: toInputString(c.best), w: toInputString(c.worst) }))),
  };
}

export interface Sample {
  key: string;
  label: string;
  matrix: EditorMatrix;
}

/** Ready-to-load opponents for the "Choose an opponent" affordance. */
export const SAMPLES: Sample[] = [
  { key: 'scotland', label: 'Scotland — WTC 8×8 test opponent', matrix: fromFixture(scotland, 'Your team', 'Scotland') },
  { key: 'six', label: 'Six — 6×6 sample', matrix: fromFixture(six, 'Your team', 'Six') },
  { key: 'smoke', label: 'Smoke — 4×4 quick demo', matrix: fromFixture(smoke, 'Your team', 'Smoke') },
];
