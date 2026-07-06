import type { NodeResult } from '../engine/types';
import type { DraftModel } from '../draft/draftState';
import { topThreats } from '../draft/cards';
import { formatTeamScore, scoreBand, teamTotal, toScore } from '../model/scale';

interface WhyPanelProps {
  node: NodeResult;
  model: DraftModel;
  myNames: string[];
  enemyNames: string[];
}

function joinName(name: string | [string, string]): string {
  return typeof name === 'string' ? name : `${name[0]} + ${name[1]}`;
}

/** Why the bot plays what it plays (docs/design-mockup.html "WHY THIS PLAY"):
 * a ranked "team EV per choice" bar list, plus — at the defender stage — a small
 * "score vs their biggest threats" sub-matrix (our top candidates × the enemy's
 * top-weighted defenders). Replaces the raw full payoff matrix. */
export function WhyPanel({ node, model, myNames, enemyNames }: WhyPanelProps) {
  if (!node.why) return null;
  const unit = node.stage === 'defender' ? 'defender' : node.stage === 'attackers' ? 'attacker pair' : 'matchup';

  // Each choice's projected full-draft team score = already-fixed games + this
  // choice's sub-game value (best continuation), converted to the 0–20n scale.
  // At refusal the cards are framed as who my defender faces (the kept enemy
  // attacker), so label the rows the same way rather than by the refused one.
  const achieved = model.fixed.reduce((sum, g) => sum + g.value, 0);
  const label = (c: NodeResult['choices'][number]): string =>
    node.stage === 'refusal'
      ? enemyNames[model.enemyPair!.find((x) => x !== (c.id as number))!]
      : joinName(c.name);
  const ranked = node.choices
    .map((c) => ({ id: c.id, name: label(c), score: teamTotal(achieved + c.ev, model.n) }))
    .sort((a, b) => b.score - a.score);
  const scores = ranked.map((r) => r.score);
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  const span = maxScore - minScore || 1;
  const barPct = (score: number): number => 35 + (65 * (score - minScore)) / span;

  const threats = topThreats(model, node, 3);
  const topRows = ranked.slice(0, 3);

  return (
    <div className="why">
      <div className="why-grid">
        <div className="why-ev">
          <div className="section-head">Team EV per {unit} choice</div>
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

        {node.stage === 'defender' && threats.length > 0 && (
          <div className="why-threats">
            <div className="section-head">Score vs their biggest threats</div>
            <div className="why-scroll">
              <table className="why-table">
                <thead>
                  <tr>
                    <th className="wcorner" />
                    {threats.map((t) => (
                      <th key={t.enemyIndex}>
                        <span className="wlabel enemy">{enemyNames[t.enemyIndex]}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topRows.map((r) => (
                    <tr key={r.id as number}>
                      <th className="wrow">
                        <span className="wlabel mine">{myNames[r.id as number]}</span>
                      </th>
                      {threats.map((t) => {
                        const score = toScore(model.matrix.cells[r.id as number][t.enemyIndex].best);
                        return (
                          <td key={t.enemyIndex} className={`num band-${scoreBand(score)}`}>
                            {score}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
