import type { CSSProperties } from 'react';
import { contextKind } from '../draft/draftState';
import type { DraftModel } from '../draft/draftState';
import { hasMapIdentity, playedMap } from '../engine/maps';
import { MAP_LETTERS } from '../engine/types';
import type { Disposition } from '../model/dispositions';
import { DISPOSITION_LABELS } from '../model/dispositions';
import { toScore } from '../model/scale';
import { pointClass, pointStep } from './palette';

interface RemainingMatchupsProps {
  model: DraftModel;
  myNames: string[];
  enemyNames: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Per-player force dispositions (display-only pills in the headers). */
  myDispositions?: Disposition[];
  enemyDispositions?: Disposition[];
}

const pill = (d: Disposition | undefined) =>
  d ? <span className={`disp disp-${d}`}>{DISPOSITION_LABELS[d]}</span> : null;

interface MatchupTileProps {
  model: DraftModel;
  m: number;
  e: number;
  label: string;
}

/** One read-only matchup tile in the Matrix page's design: the rounded mean of
 * the rated maps in the centre, palette-filled, and (with map identity) the
 * A/B/C ratings in a strip along the bottom. The map that would be played
 * given the current draft roles is bold and bright, the others dimmer. */
function MatchupTile({ model, m, e, label }: MatchupTileProps) {
  const { matrix } = model;
  const identity = hasMapIdentity(matrix);
  const scores = matrix.cells[m][e].maps.map((v) => (v === null ? null : toScore(v)));
  const rated = scores.filter((v): v is number => v !== null);
  const avg = rated.reduce((a, v) => a + v, 0) / rated.length;
  const kind = identity ? contextKind(model, m, e) : null;
  const played = kind ? playedMap(matrix, m, e, kind) : null;
  return (
    <td className="cell">
      <div className={`tile ${pointClass(avg)}`} aria-label={label}>
        <span className="tile-value">{pointStep(avg)}</span>
        {identity && (
          <div className={played ? 'tile-maps has-played' : 'tile-maps'}>
            {MAP_LETTERS.map((letter, k) => (
              <span
                key={letter}
                className={letter === played ? 'map-cell played' : 'map-cell'}
                title={letter === played ? `Played on map ${letter}` : undefined}
              >
                {scores[k] ?? letter}
              </span>
            ))}
          </div>
        )}
      </div>
    </td>
  );
}

/** Collapsible view of the shrinking sub-matrix as the draft narrows
 * (docs/design-mockup.html "Trainer": REMAINING MATCHUPS n×n), drawn with the
 * Matrix page's tiles (editor.css / theme.css are always bundled). Collapsed
 * until opened; the open state is owned by the app, so it survives step
 * changes and new drafts. */
export function RemainingMatchups({
  model, myNames, enemyNames, open, onOpenChange, myDispositions = [], enemyDispositions = [],
}: RemainingMatchupsProps) {
  const { myRemaining, enemyRemaining } = model;

  return (
    <details className="remaining" open={open}>
      <summary
        onClick={(e) => {
          // Keep React the source of truth rather than the native toggle.
          e.preventDefault();
          onOpenChange(!open);
        }}
      >
        <span className="section-head">Remaining matchups</span>
        <span className="remaining-size">
          {myRemaining.length} × {enemyRemaining.length}
        </span>
      </summary>
      <div className="why-scroll">
        <table className="grid compact" style={{ '--n': enemyRemaining.length } as CSSProperties}>
          <thead>
            <tr>
              <th className="corner" />
              {enemyRemaining.map((e) => (
                <th key={e} className="col-head">
                  <div className="col-head-inner">
                    <span className="faction-label enemy-label">{enemyNames[e]}</span>
                    {pill(enemyDispositions[e])}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {myRemaining.map((m) => (
              <tr key={m}>
                <th className="row-head">
                  <div className="row-head-inner">
                    <span className="faction-label mine-label">{myNames[m]}</span>
                    {pill(myDispositions[m])}
                  </div>
                </th>
                {enemyRemaining.map((e) => (
                  <MatchupTile key={e} model={model} m={m} e={e} label={`${myNames[m]} vs ${enemyNames[e]}`} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
