import { achievedTotal } from '../draft/draftState';
import type { DraftModel, FixedGame } from '../draft/draftState';
import { decompose, verdict } from '../draft/summary';
import { formatMatchupScore, teamResult, toScore } from '../model/scale';
import './trainer.css';

interface DraftSummaryProps {
  myTeam: string;
  enemyTeam: string;
  myNames: string[];
  enemyNames: string[];
  expected: number;
  model: DraftModel;
  onReplay: () => void;
  onEditMatrix: () => void;
}

const KIND_LABEL: Record<FixedGame['kind'], string> = {
  'my-defends': 'you defended',
  'enemy-defends': 'they defended',
  refused: 'refused pair',
  last: 'last players',
};

function joinName(name: string | [string, string]): string {
  return typeof name === 'string' ? name : `${name[0]} + ${name[1]}`;
}

export function DraftSummary({ myTeam, enemyTeam, myNames, enemyNames, expected, model, onReplay, onEditMatrix }: DraftSummaryProps) {
  const achieved = achievedTotal(model);
  const score = teamResult(achieved, model.n);
  const plan = teamResult(expected, model.n);
  const d = decompose(model.decisions, expected, achieved);
  const v = verdict(score.my, score.enemy, d);

  return (
    <div className="summary">
      <div className="result-card">
        <div className="result-label">{v.result}</div>
        <div className="big-score">
          <span className="mine">{score.my}</span>
          <span className="dash">–</span>
          <span className="enemy">{score.enemy}</span>
        </div>
        <div className="summary-line">{v.summary}</div>
        <div className="muted">planned {plan.my}–{plan.enemy} · you drafted {score.my >= plan.my ? '+' : ''}{score.my - plan.my} vs the solver's expectation</div>
      </div>

      <div className="decomp">
        <div className="metric">
          <div className="mval" style={{ color: 'var(--red-soft)' }}>−{d.totalRegret.toFixed(1)}</div>
          <div className="mlabel">your picks (regret)</div>
        </div>
        <div className="metric">
          <div className="mval" style={{ color: d.variance >= 0 ? 'var(--green)' : 'var(--amber)' }}>
            {d.variance >= 0 ? '+' : ''}{d.variance.toFixed(1)}
          </div>
          <div className="mlabel">reveal variance (luck)</div>
        </div>
      </div>

      {d.leaks.length > 0 && (
        <div>
          <div className="section-head">Where you left points (worst first)</div>
          <div className="leaks-list">
            {d.leaks.map((leak, i) => (
              <div className="leak" key={i}>
                R{leak.round} {leak.stage} — sent {joinName(leak.chosenName)} · best {joinName(leak.bestName)}{' '}
                <span className="lcost">−{leak.regret.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="locked">
        <div className="section-head">Final pairings</div>
        <div className="locked-list">
          {model.fixed.map((game, i) => {
            const my = toScore(game.value);
            return (
              <div className="pairing" key={i}>
                <span className="pmine">{myNames[game.my]}</span>
                <span className="pscore">{formatMatchupScore(my)}–{formatMatchupScore(20 - my)}</span>
                <span className="penemy">{enemyNames[game.enemy]}</span>
                <span className="pkind">{KIND_LABEL[game.kind]}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="summary-actions">
        <button className="primary" onClick={onReplay}>Draft again</button>
        <button onClick={onEditMatrix}>Back to matrix</button>
      </div>
      <p className="muted" style={{ marginTop: '0.75rem' }}>
        {myTeam || 'You'} vs {enemyTeam || 'the opponent'} · scored against the solver's pre-draft expectation.
      </p>
    </div>
  );
}
