import type { NodeResult } from '../engine/types';
import type { DraftModel } from '../draft/draftState';
import { formatTeamScore, teamTotal } from '../model/scale';

interface WhyPanelProps {
  node: NodeResult;
  model: DraftModel;
}

function joinName(name: string | [string, string]): string {
  return typeof name === 'string' ? name : `${name[0]} + ${name[1]}`;
}

/** The attacker-pair EV breakdown (docs/design-mockup.html "WHY THIS PLAY"),
 * shown alongside the coaching hints at the attackers stage: every offered pair
 * ranked by the projected full-draft team score if you send it. This is the
 * one "why" view that adds something over the per-card hints — the defender and
 * pairing stages already surface their per-choice EV on the cards, so nothing
 * extra renders there. */
export function WhyPanel({ node, model }: WhyPanelProps) {
  if (!node.why || node.stage !== 'attackers') return null;

  // Each pair's projected team score = already-fixed games + this pair's sub-game
  // value (best continuation), on the 0–20n scale, ranked best first.
  const achieved = model.fixed.reduce((sum, g) => sum + g.value, 0);
  const ranked = node.choices
    .map((c) => ({ name: joinName(c.name), score: teamTotal(achieved + c.ev, model.n) }))
    .sort((a, b) => b.score - a.score);
  const scores = ranked.map((r) => r.score);
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  const span = maxScore - minScore || 1;
  const barPct = (score: number): number => 35 + (65 * (score - minScore)) / span;

  return (
    <div className="why">
      <div className="why-ev">
        <div className="section-head">Team EV per attacker pair choice</div>
        <table className="ev-table">
          <tbody>
            {ranked.map((r, i) => (
              <tr key={i}>
                <td className="ev-name">{r.name}</td>
                <td className="ev-bar">
                  <span className={i === 0 ? 'top' : ''} style={{ width: `${barPct(r.score)}%` }} />
                </td>
                <td className="ev-val num">{formatTeamScore(r.score)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
