import type { DraftModel } from '../draft/draftState';

/** In-progress (pre-lock) picks, so the board can fill + highlight the panels as
 * the user selects — before they lock the choice. */
export interface PendingPicks {
  /** Defender stage: my pending defender index, or null before a pick. */
  defender: number | null;
  /** Attackers stage: my pending attacker indices, in pick order (≤2). */
  attackers: number[];
  /** Pairing stage: the enemy attacker my defender will face (highlighted); the
   * other member of the sent pair is the refused one (dimmed). Null before a
   * pick, in which case both are highlighted. */
  face: number | null;
}

interface DraftBoardProps {
  model: DraftModel;
  myNames: string[];
  enemyNames: string[];
  pending?: PendingPicks;
}

const NO_PENDING: PendingPicks = { defender: null, attackers: [], face: null };

/** The two-panel draft board (docs/design-mockup.html "Trainer"): each side's
 * defender flanked by the two opposing attackers that land on it. Reads the
 * locked round scratch from `DraftModel` and overlays the current in-progress
 * pick (`pending`) so slots fill and highlight before the user locks — an
 * in-play slot gets its side's coloured border, a refused attacker stays but
 * dims, and not-yet-known picks show `selecting…` / `?` / `—`. "our/their map"
 * are conceptual labels — the value model folds the map choice into best/worst
 * rather than naming maps. */
export function DraftBoard({ model, myNames, enemyNames, pending = NO_PENDING }: DraftBoardProps) {
  // Our defender: locked → pending pick (highlighted) → "selecting…".
  const myDefIdx = model.myDefender >= 0 ? model.myDefender : pending.defender;
  const myDefCls = myDefIdx != null ? 'slot def mine filled on' : 'slot def mine pending on';

  const enDefName = model.enemyDefender >= 0 ? enemyNames[model.enemyDefender] : null;

  // Enemy attackers landing on my defender: hidden until the pairing stage, then
  // the faced one is highlighted and the refused one dimmed.
  const enAtkSlots: { name: string | null; cls: string }[] = model.enemyPair
    ? model.enemyPair.map((e) => ({
        name: enemyNames[e],
        cls: `slot atk enemy filled ${pending.face == null || e === pending.face ? 'on' : 'muted'}`,
      }))
    : [
        { name: null, cls: 'slot atk enemy hidden' },
        { name: null, cls: 'slot atk enemy hidden' },
      ];

  // My attackers landing on their defender: locked pair, else my pending picks.
  const myAtkSlots: { name: string | null; cls: string }[] = model.myPair
    ? model.myPair.map((a) => ({ name: myNames[a], cls: 'slot atk mine filled on' }))
    : [0, 1].map((i) => {
        const idx = pending.attackers[i];
        return idx != null
          ? { name: myNames[idx], cls: 'slot atk mine filled on' }
          : { name: null, cls: 'slot atk mine empty' };
      });

  return (
    <div className="draft-board">
      <div className="board-panel">
        <div className="board-title">Our defender · our map</div>
        <div className={myDefCls}>
          <span className="slot-tag">DEF</span>
          <span className="slot-name">{myDefIdx != null ? myNames[myDefIdx] : 'selecting…'}</span>
        </div>
        <div className="slot-pair">
          {enAtkSlots.map((s, i) => (
            <div key={i} className={s.cls}>
              <span className="slot-name">{s.name ?? '?'}</span>
            </div>
          ))}
        </div>
        {!model.enemyPair && <div className="board-hint">Their two attackers will land here</div>}
      </div>

      <div className="board-panel">
        <div className="board-title">Their defender · their map</div>
        <div className={enDefName ? 'slot def enemy filled on' : 'slot def enemy hidden'}>
          <span className="slot-tag">DEF</span>
          <span className="slot-name">{enDefName ?? '?'}</span>
        </div>
        <div className="slot-pair">
          {myAtkSlots.map((s, i) => (
            <div key={i} className={s.cls}>
              <span className="slot-name">{s.name ?? '—'}</span>
            </div>
          ))}
        </div>
        {!model.myPair && pending.attackers.length === 0 && (
          <div className="board-hint">Your two attackers will land here</div>
        )}
      </div>
    </div>
  );
}
