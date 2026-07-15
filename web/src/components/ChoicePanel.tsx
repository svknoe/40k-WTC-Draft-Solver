import type { NodeResult } from '../engine/types';
import type { DraftModel } from '../draft/draftState';
import { achievedTotal } from '../draft/draftState';
import {
  attackerOptions,
  candidateStats,
  enemyAttackerOptions,
  enemyCandidateStats,
  enemyChoices,
  enemyPairColIndex,
  pairChoiceIndex,
} from '../draft/cards';
import { formatTeamScore, scoreBand, teamTotal } from '../model/scale';

export type PanelSide = 'my' | 'enemy';

interface ChoicePanelProps {
  model: DraftModel;
  node: NodeResult;
  /** Which seat this panel plays. 'my' renders node.choices exactly as the
   * classic bot-mode panel; 'enemy' renders the engine columns in column order,
   * with every figure flipped to the opponent's own perspective. At the
   * single-select stages (defender / refusal) the selection index IS the column
   * index applyStep takes; at the attackers stage the cards are per-attacker and
   * the column is resolved from the two picks by enemyPairColIndex on lock. */
  side: PanelSide;
  showHints: boolean;
  /** Single-select stages: the selected choice/column index. */
  selected: number | null;
  /** Attackers stage: the (≤2) picked attacker player indices, in pick order. */
  attackerSel: number[];
  onSelect: (index: number) => void;
  onToggleAttacker: (index: number) => void;
  /** Two-player mode heading naming the seat's team; omitted in bot mode. */
  label?: string;
}

function joinName(name: string | [string, string]): string {
  return typeof name === 'string' ? name : `${name[0]} + ${name[1]}`;
}

/** One seat's choice cards for the current stage — the classic trainer cards,
 * parameterised by side so the two-player mode can render one panel per seat.
 * All copy and numbers are seat-relative ("our map", scores out of 20 for the
 * seat that is choosing), matching the app-wide convention. */
export function ChoicePanel({ model, node, side, showHints, selected, attackerSel, onSelect, onToggleAttacker, label }: ChoicePanelProps) {
  const stage = node.stage as 'defender' | 'attackers' | 'refusal';
  const { myNames, enemyNames } = model.matrix;
  const mineSide = side === 'my';
  const achieved = mineSide ? achievedTotal(model) : -achievedTotal(model);
  const choices = mineSide ? node.choices : enemyChoices(model, node);
  const stats = (i: number) => (mineSide ? candidateStats(model, node, i) : enemyCandidateStats(model, node, i));
  // The seat's own players (its attacker cards); the opposing side's names are
  // what a refusal card shows (whom this seat's defender faces).
  const ownNames = mineSide ? myNames : enemyNames;
  const facedNames = mineSide ? enemyNames : myNames;
  const facedPair = mineSide ? model.enemyPair : model.myPair;

  const body =
    stage === 'attackers' ? (
      <>
        <div className="choices grid">
          {(mineSide ? attackerOptions(model, node) : enemyAttackerOptions(model, node)).map((opt) => {
            const sel = attackerSel.includes(opt.index);
            return (
              <button
                key={opt.index}
                className={sel ? 'choice selected' : 'choice'}
                aria-pressed={sel}
                onClick={() => onToggleAttacker(opt.index)}
              >
                <span className="cname">
                  {ownNames[opt.index]}
                  {sel && <span className="tick" aria-hidden="true">✓</span>}
                </span>
                <span className="cstat">
                  their map · <span className={`num band-${scoreBand(opt.rating)}`}>{opt.rating}</span>
                </span>
                {showHints && (
                  <span className="chint">
                    <span className="cbar"><span style={{ width: `${Math.min(100, opt.sendProb * 100)}%` }} /></span>
                    <span className="csend">{(opt.sendProb * 100).toFixed(0)}%</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {showHints && attackerSel.length === 2 && (() => {
          const ci = mineSide
            ? pairChoiceIndex(node, attackerSel[0], attackerSel[1])
            : enemyPairColIndex(model, attackerSel[0], attackerSel[1]);
          if (ci < 0) return null;
          const c = choices[ci];
          const bestEv = choices.reduce((m, ch) => Math.max(m, ch.ev), -Infinity);
          const regret = c.ev - bestEv; // ≤ 0; 0 means this pair is an equilibrium best
          return (
            <div className="pair-summary">
              <span className="ps-label">{mineSide ? 'Your pair' : 'Their pair'}</span>
              <span className="ps-names">{joinName(c.name)}</span>
              <span className="ps-fig">
                {(c.prob * 100).toFixed(0)}% of equilibrium · EV {formatTeamScore(teamTotal(achieved + c.ev, model.n))}
              </span>
              {regret < -0.05 && <span className="ps-regret">{regret.toFixed(1)} vs best</span>}
            </div>
          );
        })()}
      </>
    ) : (
      <div className="choices grid">
        {choices.map((choice, i) => {
          const s = stats(i);
          // Refusal cards are framed as who this seat's defender faces: show
          // the opposing attacker it keeps (choice.id is the refused one).
          const faced = stage === 'refusal' ? facedPair!.find((x) => x !== (choice.id as number))! : -1;
          return (
            <button
              key={i}
              className={selected === i ? 'choice selected' : 'choice'}
              onClick={() => onSelect(i)}
            >
              <span className="cname">
                {stage === 'refusal' ? facedNames[faced] : joinName(choice.name)}
              </span>
              <span className="cstat">
                our map ·{' '}
                {stage === 'refusal' ? (
                  <span className={`num band-${scoreBand(s.avg)}`}>{s.avg}</span>
                ) : s.avg === s.floor ? (
                  <>keeps <span className={`num band-${scoreBand(s.avg)}`}>{s.avg}</span></>
                ) : (
                  <>
                    avg <span className={`num band-${scoreBand(s.avg)}`}>{s.avg}</span>
                    {' · '}floor <span className={`num band-${scoreBand(s.floor)}`}>{s.floor}</span>
                  </>
                )}
              </span>
              {showHints && (
                <span className="chint">
                  <span className="cbar"><span style={{ width: `${Math.min(100, choice.prob * 100)}%` }} /></span>
                  <span className="cprob">{(choice.prob * 100).toFixed(0)}%</span>
                  <span className="cev">EV {formatTeamScore(teamTotal(achieved + choice.ev, model.n))}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    );

  return (
    <div className={`choice-panel ${side === 'my' ? 'mine' : 'enemy'}`}>
      {label && <div className="panel-label">{label}</div>}
      {body}
    </div>
  );
}
