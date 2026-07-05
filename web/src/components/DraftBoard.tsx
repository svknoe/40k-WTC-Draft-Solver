import type { DraftModel } from '../draft/draftState';

interface DraftBoardProps {
  model: DraftModel;
  myNames: string[];
  enemyNames: string[];
  /** The current decision, so the slot being chosen can highlight. */
  stage: 'defender' | 'attackers' | 'refusal';
}

/** The two-panel draft board (docs/design-mockup.html "Trainer"): each side's
 * defender flanked by the two opposing attackers that land on it. Everything is
 * read from the in-progress round scratch on `DraftModel`; unknown picks show
 * `selecting…` (ours, in progress), `?` (theirs, hidden), or `—` (not sent
 * yet). "our/their map" are conceptual labels — the value model folds the map
 * choice into best/worst rather than naming maps. */
export function DraftBoard({ model, myNames, enemyNames, stage }: DraftBoardProps) {
  const myDef = model.myDefender >= 0 ? myNames[model.myDefender] : null;
  const enDef = model.enemyDefender >= 0 ? enemyNames[model.enemyDefender] : null;
  const enAtk = model.enemyPair ? (model.enemyPair.map((i) => enemyNames[i]) as [string, string]) : null;
  const myAtk = model.myPair ? (model.myPair.map((i) => myNames[i]) as [string, string]) : null;

  return (
    <div className="draft-board">
      <div className="board-panel">
        <div className="board-title">Our defender · our map</div>
        <div className={`slot def mine${myDef ? ' filled' : ' pending'}${!myDef && stage === 'defender' ? ' active' : ''}`}>
          <span className="slot-tag">DEF</span>
          <span className="slot-name">{myDef ?? 'selecting…'}</span>
        </div>
        <div className="slot-pair">
          {(enAtk ?? [null, null]).map((name, i) => (
            <div key={i} className={`slot atk enemy${name ? ' filled' : ' hidden'}${!enAtk && stage === 'refusal' ? ' active' : ''}`}>
              <span className="slot-name">{name ?? '?'}</span>
            </div>
          ))}
        </div>
        {!enAtk && <div className="board-hint">Their two attackers will land here</div>}
      </div>

      <div className="board-panel">
        <div className="board-title">Their defender · their map</div>
        <div className={`slot def enemy${enDef ? ' filled' : ' hidden'}`}>
          <span className="slot-tag">DEF</span>
          <span className="slot-name">{enDef ?? '?'}</span>
        </div>
        <div className="slot-pair">
          {(myAtk ?? [null, null]).map((name, i) => (
            <div key={i} className={`slot atk mine${name ? ' filled' : ' empty'}${!myAtk && stage === 'attackers' ? ' active' : ''}`}>
              <span className="slot-name">{name ?? '—'}</span>
            </div>
          ))}
        </div>
        {!myAtk && <div className="board-hint">Your two attackers will land here</div>}
      </div>
    </div>
  );
}
