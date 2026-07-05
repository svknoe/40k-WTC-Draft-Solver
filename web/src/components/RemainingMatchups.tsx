import type { DraftModel } from '../draft/draftState';
import { scoreBand, toScore } from '../model/scale';

interface RemainingMatchupsProps {
  model: DraftModel;
  myNames: string[];
  enemyNames: string[];
}

/** Collapsible view of the shrinking sub-matrix as the draft narrows
 * (docs/design-mockup.html "Trainer": REMAINING MATCHUPS n×n). Best-map values
 * on the 0–20 scale, banded. `.band-*` colour classes come from the always-
 * bundled editor.css. Collapsed by default. */
export function RemainingMatchups({ model, myNames, enemyNames }: RemainingMatchupsProps) {
  const { myRemaining, enemyRemaining, matrix } = model;

  return (
    <details className="remaining">
      <summary>
        <span className="section-head">Remaining matchups</span>
        <span className="remaining-size">
          {myRemaining.length} × {enemyRemaining.length}
        </span>
      </summary>
      <div className="why-scroll">
        <table className="why-table">
          <thead>
            <tr>
              <th className="wcorner" />
              {enemyRemaining.map((e) => (
                <th key={e}>
                  <span className="wlabel enemy">{enemyNames[e]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {myRemaining.map((m) => (
              <tr key={m}>
                <th className="wrow">
                  <span className="wlabel mine">{myNames[m]}</span>
                </th>
                {enemyRemaining.map((e) => {
                  const score = toScore(matrix.cells[m][e].best);
                  return (
                    <td key={e} className={`num band-${scoreBand(score)}`}>
                      {score}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
