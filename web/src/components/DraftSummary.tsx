import { achievedTotal } from '../draft/draftState';
import type { DraftDecision, DraftModel, FixedGame } from '../draft/draftState';
import { decompose, decompose2p, verdict, verdict2p } from '../draft/summary';
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

function HistoryList({ decisions }: { decisions: DraftDecision[] }) {
  return (
    <div className="history">
      {decisions.map((dec, i) => {
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
  );
}

export function DraftSummary({ myTeam, enemyTeam, myNames, enemyNames, expected, model, onReplay, onEditMatrix }: DraftSummaryProps) {
  const achieved = achievedTotal(model);
  const score = teamResult(achieved, model.n);
  const plan = teamResult(expected, model.n);
  // Two-player drafts score both seats (per-seat regret + reveal luck); bot
  // drafts keep the classic my-regret/variance split.
  const d = decompose(model.decisions, expected, achieved);
  const d2 = model.twoPlayer ? decompose2p(model.decisions, model.enemyDecisions, expected, achieved) : null;
  const v = d2 ? verdict2p(score.my, score.enemy, d2) : verdict(score.my, score.enemy, d);

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

      {d2 ? (
        <div className="decomp three">
          <div className="metric">
            <div className="mval" style={{ color: 'var(--red-soft)' }}>−{d2.myRegret.toFixed(1)}</div>
            <div className="mlabel">your picks (regret)</div>
          </div>
          <div className="metric">
            <div className="mval" style={{ color: 'var(--enemy)' }}>−{d2.enemyRegret.toFixed(1)}</div>
            <div className="mlabel">their picks (regret)</div>
          </div>
          <div className="metric">
            <div className="mval" style={{ color: d2.revealLuck >= 0 ? 'var(--green)' : 'var(--amber)' }}>
              {d2.revealLuck >= 0 ? '+' : ''}{d2.revealLuck.toFixed(1)}
            </div>
            <div className="mlabel">reveal luck (yours)</div>
          </div>
        </div>
      ) : (
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
      )}

      <div>
        <div className="section-head">Your draft</div>
        <HistoryList decisions={model.decisions} />
      </div>

      {d2 && (
        <div style={{ marginTop: '1rem' }}>
          <div className="section-head">Their draft</div>
          <HistoryList decisions={model.enemyDecisions} />
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
        {myTeam || 'You'} vs {enemyTeam || 'the opponent'} ·{' '}
        {model.twoPlayer ? 'you played both seats · ' : ''}scored against the solver's pre-draft expectation.
      </p>
    </div>
  );
}
