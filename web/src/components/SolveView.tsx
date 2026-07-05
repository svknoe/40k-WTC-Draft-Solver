import { teamResult } from '../model/scale';
import type { SolveState } from '../worker/useSolve';
import { ProgressBar } from './ProgressBar';
import { StrategyTable, StrategyRow } from './StrategyTable';
import './solve.css';

interface SolveViewProps {
  myTeam: string;
  enemyTeam: string;
  /** Team size, for the displayed team-result baseline (20n total). */
  n: number;
  /** Whether the current matrix is complete/valid enough to solve. */
  canRun: boolean;
  solve: SolveState;
  onRun: () => void;
  /** Provided once the trainer exists (#21). */
  onTrain?: () => void;
}

const PHASE_LABEL = {
  enumerating: 'Enumerating game states…',
  inducting: 'Solving by backward induction…',
} as const;

function nameOf(name: string | [string, string]): string {
  return typeof name === 'string' ? name : `${name[0]} + ${name[1]}`;
}

export function SolveView({ myTeam, enemyTeam, n, canRun, solve, onRun, onTrain }: SolveViewProps) {
  const my = myTeam || 'Your team';
  const enemy = enemyTeam || 'Opponent';

  if (solve.status === 'done' && solve.result) {
    const { expected, root } = solve.result;
    const score = teamResult(expected, n);
    const verdict =
      score.favored > 0 ? `${my} favored by ${score.favored}`
      : score.favored < 0 ? `${enemy} favored by ${-score.favored}`
      : 'Dead even';

    const myRows: StrategyRow[] = root.choices
      .map((c) => ({ name: nameOf(c.name), prob: c.prob, ev: c.ev }))
      .sort((a, b) => b.prob - a.prob);

    const why = root.why;
    const enemyRows: StrategyRow[] = why
      ? why.colLabels
          .map((label, j) => ({ name: label, prob: why.enStrategy[j] }))
          .sort((a, b) => b.prob - a.prob)
      : [];

    return (
      <div className="solve done">
        <div className="result-card">
          <div className="result-split">
            <div className="result-score">
              <div className="section-head">Expected draft result</div>
              <div className="big-score">
                <span className="mine">{score.my}</span>
                <span className="dash">–</span>
                <span className="enemy">{score.enemy}</span>
              </div>
            </div>
            <div className="result-verdict">
              <div className={`verdict ${score.favored > 0 ? 'up' : score.favored < 0 ? 'down' : ''}`}>{verdict}</div>
              <div className="muted">
                sum of {n} games · {20 * n} points total
              </div>
            </div>
          </div>
        </div>

        <div className="mixes">
          <StrategyTable title={`${my} — opening defender mix`} rows={myRows} accent="mine" />
          <StrategyTable title={`${enemy} — opening defender mix`} rows={enemyRows} accent="enemy" />
        </div>

        <div className="solve-actions">
          <button onClick={onRun}>Re-run solver</button>
          <button
            className="primary"
            disabled={!onTrain}
            onClick={onTrain}
            title={onTrain ? undefined : 'Training arrives with issue #21'}
          >
            Practice against the bot →
          </button>
        </div>
      </div>
    );
  }

  if (solve.status === 'solving') {
    return (
      <div className="solve solving">
        <h2>Solving the pairing game…</h2>
        <ProgressBar frac={solve.progress} label={solve.phase ? PHASE_LABEL[solve.phase] : 'Starting…'} />
      </div>
    );
  }

  return (
    <div className="solve idle">
      <h2>Solve the pairing game</h2>
      <p className="muted">
        Computes the full draft equilibrium from the current matchup matrix: your expected team
        result and the optimal mixed strategy for the opening defender put-up, on both sides.
      </p>
      {solve.status === 'error' && <div className="errors">Solve failed: {solve.error}</div>}
      <div>
        <button className="primary run" disabled={!canRun} onClick={onRun} title={canRun ? undefined : 'Complete the matrix first'}>
          Run solver
        </button>
        {!canRun && <span className="muted"> Complete the matrix to solve.</span>}
      </div>
    </div>
  );
}
