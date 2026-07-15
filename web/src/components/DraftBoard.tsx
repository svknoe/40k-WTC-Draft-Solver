import type { DraftModel } from '../draft/draftState';
import { endgameNOf } from '../draft/draftState';

/** In-progress (pre-lock) picks, so the board can fill + highlight the panels as
 * the user selects — before they lock the choice. The enemy fields are only
 * fed in two-player mode (the bot's pick has no preview to show). */
export interface PendingPicks {
  /** Defender stage: my pending defender index, or null before a pick. */
  defender: number | null;
  /** Attackers stage: my pending attacker indices, in pick order (≤2). */
  attackers: number[];
  /** Pairing stage: the enemy attacker my defender will face (highlighted); the
   * other member of the sent pair is the refused one (dimmed). Null before a
   * pick, in which case both are highlighted. */
  face: number | null;
  /** Two-player defender stage: the opponent seat's pending defender. */
  enemyDefender?: number | null;
  /** Two-player attackers stage: the opponent seat's pending attackers (≤2). */
  enemyAttackers?: number[];
  /** Two-player pairing stage: the FRIENDLY attacker their defender will face
   * (my other sent attacker is the one they refuse, dimmed). */
  enemyFace?: number | null;
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
  const myDefCls = myDefIdx != null ? 'slot def mine filled on' : 'slot def mine pending';

  // Their defender: locked → two-player pending pick → hidden "?".
  const pendingEnemyDef = pending.enemyDefender ?? null;
  const enDefIdx = model.enemyDefender >= 0 ? model.enemyDefender : pendingEnemyDef;
  const enDefName = enDefIdx != null ? enemyNames[enDefIdx] : null;

  // Enemy attackers landing on my defender: hidden until known (locked pair, or
  // the two-player pending picks), then the faced one is highlighted and the
  // refused one dimmed at the pairing stage.
  const pendingEnemyAtk = pending.enemyAttackers ?? [];
  const enAtkSlots: { name: string | null; cls: string }[] = model.enemyPair
    ? model.enemyPair.map((e) => ({
        name: enemyNames[e],
        cls: `slot atk enemy filled ${pending.face == null || e === pending.face ? 'on' : 'muted'}`,
      }))
    : [0, 1].map((i) => {
        const idx = pendingEnemyAtk[i];
        return idx != null
          ? { name: enemyNames[idx], cls: 'slot atk enemy filled on' }
          : { name: null, cls: 'slot atk enemy hidden' };
      });

  // My attackers landing on their defender: locked pair (with the two-player
  // pending refusal highlighting whom their defender faces), else my pending
  // picks.
  const myAtkSlots: { name: string | null; cls: string }[] = model.myPair
    ? model.myPair.map((a) => ({
        name: myNames[a],
        cls: `slot atk mine filled ${pending.enemyFace == null || a === pending.enemyFace ? 'on' : 'muted'}`,
      }))
    : [0, 1].map((i) => {
        const idx = pending.attackers[i];
        return idx != null
          ? { name: myNames[idx], cls: 'slot atk mine filled on' }
          : { name: null, cls: 'slot atk mine empty' };
      });

  // Final round only: preview the games that resolve automatically on lock —
  // the refused pair, plus (even team sizes only) the last players — filling
  // in as each side becomes known. Shown from the attackers step on.
  const stage = model.myDefender < 0 ? 'defender' : model.myPair === null ? 'attackers' : 'refusal';
  const showAutoPaired = model.round === model.finalRound && stage !== 'defender';
  const hasLast = endgameNOf(model.n) === 4;
  let myLast = '?';
  let enLast = '?';
  let refMine = '?';
  let refThem = '?';
  if (showAutoPaired) {
    const { myRemaining, enemyRemaining, myDefender, enemyDefender, myPair, enemyPair } = model;
    if (myPair && enemyPair) {
      if (hasLast) {
        // refusal stage: both leftover players are settled (attackers are locked)
        const ml = myRemaining.find((x) => x !== myDefender && !myPair.includes(x));
        if (ml != null) myLast = myNames[ml];
        const el = enemyRemaining.find((x) => x !== enemyDefender && !enemyPair.includes(x));
        if (el != null) enLast = enemyNames[el];
      }
      // the enemy attacker I refuse is the one I'm not facing
      if (pending.face != null) {
        const rt = enemyPair.find((x) => x !== pending.face);
        if (rt != null) refThem = enemyNames[rt];
      }
      // two-player: my attacker they refuse is the one their defender won't face
      if (pending.enemyFace != null) {
        const rm = myPair.find((x) => x !== pending.enemyFace);
        if (rm != null) refMine = myNames[rm];
      }
    } else if (hasLast) {
      // attackers stage: each leftover is whichever player wasn't sent
      if (pending.attackers.length === 2) {
        const ml = myRemaining.find((x) => x !== myDefender && !pending.attackers.includes(x));
        if (ml != null) myLast = myNames[ml];
      }
      if (pendingEnemyAtk.length === 2) {
        const el = enemyRemaining.find((x) => x !== enemyDefender && !pendingEnemyAtk.includes(x));
        if (el != null) enLast = enemyNames[el];
      }
    }
  }

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
        {!model.enemyPair && pendingEnemyAtk.length === 0 && (
          <div className="board-hint">Their two attackers will land here</div>
        )}
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

      {showAutoPaired && (
        <div className="board-panel">
          <div className="board-title">Auto-paired this round</div>
          {hasLast && (
            <div className="slot def auto">
              <span className="slot-tag">LAST</span>
              <span className="slot-name">{myLast} vs {enLast}</span>
            </div>
          )}
          <div className="slot empty">
            <span className="slot-name">refused: {refMine} vs {refThem}</span>
          </div>
          <div className="board-hint">Resolves on lock · scored as avg of both maps</div>
        </div>
      )}
    </div>
  );
}
