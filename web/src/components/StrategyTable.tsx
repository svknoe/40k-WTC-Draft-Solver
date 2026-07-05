export interface StrategyRow {
  name: string;
  prob: number;
  ev?: number;
}

interface StrategyTableProps {
  title: string;
  rows: StrategyRow[];
  accent?: 'mine' | 'enemy';
  showEv?: boolean;
}

/** A mixed-strategy table: option name, an equilibrium-weight bar + percentage,
 * and optionally the per-option EV. Rows are rendered in the given order
 * (callers sort). Reused by the solve view and the trainer/Why panel. */
export function StrategyTable({ title, rows, accent, showEv }: StrategyTableProps) {
  return (
    <div className={accent ? `strategy ${accent}` : 'strategy'}>
      <div className="section-head">{title}</div>
      <table className="strategy-table">
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td className={accent ? `sname ${accent}` : 'sname'}>{row.name}</td>
              <td className="sbar">
                <span style={{ width: `${Math.min(100, row.prob * 100)}%` }} />
              </td>
              <td className="sprob num">{(row.prob * 100).toFixed(0)}%</td>
              {showEv && (
                <td className="sev num">
                  {row.ev === undefined ? '' : `${row.ev >= 0 ? '+' : ''}${row.ev.toFixed(1)}`}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
