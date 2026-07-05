import type { NodeResult } from '../engine/types';

/** The Why panel (§3.3): the payoff matrix at the current node (child game
 * values, internal team-margin scale) with both equilibrium mixes on the
 * margins and the support cells highlighted. */
export function WhyPanel({ node }: { node: NodeResult }) {
  const why = node.why;
  if (!why) return null;
  const unit = node.stage === 'defender' ? 'defender' : node.stage === 'attackers' ? 'attacker pair' : 'refusal';

  return (
    <div className="why">
      <div className="section-head">Payoff — team margin per {unit} choice (rows = you, cols = them)</div>
      <div className="why-scroll">
        <table className="why-table">
          <thead>
            <tr>
              <th className="wcorner" />
              {why.colLabels.map((label, j) => (
                <th key={j}>
                  <div className="wlabel enemy">{label}</div>
                  <div className="wprob">{(why.enStrategy[j] * 100).toFixed(0)}%</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {why.rowLabels.map((label, i) => (
              <tr key={i}>
                <th className="wrow">
                  <span className="wlabel mine">{label}</span>
                  <span className="wprob">{(why.myStrategy[i] * 100).toFixed(0)}%</span>
                </th>
                {why.colLabels.map((_, j) => {
                  const v = why.payoff[i][j];
                  const support = why.myStrategy[i] > 1e-6 && why.enStrategy[j] > 1e-6;
                  return (
                    <td key={j} className={support ? 'wcell support num' : 'wcell num'}>
                      {v >= 0 ? '+' : ''}{v.toFixed(1)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
