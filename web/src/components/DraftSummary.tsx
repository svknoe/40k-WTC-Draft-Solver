import { achievedTotal } from '../draft/draftState';
import type { DraftDecision, DraftModel, FixedGame } from '../draft/draftState';
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

// The defender picks the map, so a played game is on that side's map; the
// refused / last games have no defender, so they keep their own labels.
const KIND_LABEL: Record<FixedGame['kind'], string> = {
  'my-defends': 'your map',
  'enemy-defends': 'their map',
  refused: 'refused pair',
  last: 'last players',
};

// History row prefix: the phase label + the verb for what you chose.
const STAGE_HISTORY: Record<DraftDecision['stage'], { label: string; verb: string }> = {
  defender: { label: 'defenders', verb: 'put up' },
  attackers: { label: 'attackers', verb: 'sent' },
  refusal: { label: 'pairing', verb: 'faced' },
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

      <div>
        <div className="section-head">Your draft</div>
        <div className="history">
          {model.decisions.map((dec, i) => {
            const opt = dec.regret < 0.05;
            const sh = STAGE_HISTORY[dec.stage];
            return (
              <div className="hrow" key={i}>
                <span className="hlabel">R{dec.round} {sh.label} — {sh.verb} {joinName(dec.chosenName)}</span>
                <span className="hbest">{opt ? 'best move' : `best ${joinName(dec.bestName)}`}</span>
                <span className={`hval ${opt ? 'opt' : dec.regret >= 2 ? 'major' : 'minor'}`}>
                  {opt ? '✓ 0.0' : `−${dec.regret.toFixed(1)}`}
                </span>
              </div>
            );
          })}
        </div>
      </div>

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
