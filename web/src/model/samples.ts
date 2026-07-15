import { fixtureMatrix, scotland, six, smoke } from '../conformance/fixtures';
import type { Fixture } from '../conformance/fixtures';
import type { EditorMatrix, MatrixSize } from './matrix';
import { toInputString } from './scale';

// Two disjoint faction pools (names must be distinct across the whole matrix).
const MY_FACTIONS = [
  'Space Marines', 'Astra Militarum', 'Adeptus Custodes', 'Grey Knights',
  'Adepta Sororitas', 'Imperial Knights', 'Adeptus Mechanicus', 'Space Wolves',
];
const ENEMY_FACTIONS = [
  'Necrons', 'Orks', "T'au Empire", 'Tyranids',
  'Aeldari', 'Drukhari', 'Death Guard', 'Chaos Knights',
];

/** A sample from a conformance fixture: keep its real (non-trivial, solvable)
 * cell values but label the players with factions rather than the fixture's
 * own names. `n` may be smaller than the fixture's size — the top-left block
 * of a real matrix is itself a real matrix (used for the 5x5 sample; there is
 * no odd-size fixture and the frozen fixtures are never extended). */
function fromFixture(fixture: Fixture, n: MatrixSize = fixture.n): EditorMatrix {
  const m = fixtureMatrix(fixture);
  return {
    n,
    myTeam: 'Your team',
    enemyTeam: 'Opposing team',
    myNames: MY_FACTIONS.slice(0, n),
    enemyNames: ENEMY_FACTIONS.slice(0, n),
    cells: m.cells.slice(0, n).map((row) =>
      row.slice(0, n).map((c) => ({ b: toInputString(c.best), w: toInputString(c.worst) }))),
  };
}

/** A blank starting point: dummy player names and an even 10-10 in every cell. */
function template(n: MatrixSize): EditorMatrix {
  return {
    n,
    myTeam: 'Your team',
    enemyTeam: 'Opposing team',
    myNames: Array.from({ length: n }, (_, i) => `Player ${i + 1}`),
    enemyNames: Array.from({ length: n }, (_, i) => `Opponent ${i + 1}`),
    cells: Array.from({ length: n }, () => Array.from({ length: n }, () => ({ b: '10', w: '10' }))),
  };
}

export interface Sample {
  key: string;
  label: string;
  matrix: EditorMatrix;
}

/** Ready-to-load matrices for the "Choose an opponent" affordance. Template
 * first (a blank even 8×8 to build from); then real solvable samples by size. */
export const SAMPLES: Sample[] = [
  { key: 'template', label: 'Template', matrix: template(8) },
  { key: 'eight', label: '8v8 example', matrix: fromFixture(scotland) },
  { key: 'six', label: '6v6 example', matrix: fromFixture(six) },
  { key: 'five', label: '5v5 example', matrix: fromFixture(scotland, 5) },
  { key: 'four', label: '4v4 example', matrix: fromFixture(smoke) },
];
