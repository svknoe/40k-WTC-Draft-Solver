import { useRef, useState } from 'react';
import type { Matrix, NodeResult } from '../engine/types';
import { sampleIndex } from '../draft/sampling';
import type { DraftModel } from '../draft/draftState';
import { applyStep, initDraft } from '../draft/draftState';
import { attackerOptions, candidateStats, pairChoiceIndex, projectedResult } from '../draft/cards';
import { formatTeamScore, scoreBand, teamTotal, toScore } from '../model/scale';
import { activeWtcEvent } from '../model/wtcDates';
import type { SolveState } from '../worker/useSolve';
import { DraftBoard } from './DraftBoard';
import { DraftSummary } from './DraftSummary';
import { PhaseStepper } from './PhaseStepper';
import { ProgressBar } from './ProgressBar';
import { RemainingMatchups } from './RemainingMatchups';
import { WhyPanel } from './WhyPanel';
import './trainer.css';

interface DraftTrainerProps {
  matrix: Matrix;
  myTeam: string;
  enemyTeam: string;
  neutralWeight: number;
  solve: SolveState;
  onEditMatrix: () => void;
}

const STAGE_COPY = {
  defender: { title: 'Select your defender', sub: 'Both captains put up a defender at the same time.' },
  attackers: { title: 'Send two attackers', sub: 'You send two — the enemy chooses which one your defender faces.' },
} as const;

function joinName(name: string | [string, string]): string {
  return typeof name === 'string' ? name : `${name[0]} + ${name[1]}`;
}

export function DraftTrainer({ matrix, myTeam, enemyTeam, neutralWeight, solve, onEditMatrix }: DraftTrainerProps) {
  const { myNames, enemyNames } = matrix;
  const [model, setModel] = useState<DraftModel | null>(null);
  const [history, setHistory] = useState<DraftModel[]>([]);
  const [node, setNode] = useState<NodeResult | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  // Attackers stage only: the (≤2) individually-picked attacker indices. Other
  // stages select a single choice via `selected`.
  const [attackerSel, setAttackerSel] = useState<number[]>([]);
  const [reveal, setReveal] = useState<{ mine: string; enemy: string } | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  const [hints, setHints] = useState(true);
  const rng = useRef<() => number>(Math.random);

  const ready = solve.status === 'done' && solve.solvedK === null;
  const expected = solve.result?.expected ?? 0;
  const finalRound = (matrix.n - 4) / 2 + 1;
  const enemy = enemyTeam || 'The bot';
  // Coaching hints (per-choice strategy/EV + the Why panel) auto-disable during
  // official WTC dates so the app can't be used at the table (the About copy).
  const wtcLock = activeWtcEvent(new Date());
  const hintsAllowed = wtcLock === null;
  const showHints = hints && hintsAllowed;

  const start = () => {
    if (!ready) return;
    setModel(initDraft(matrix, neutralWeight));
    setHistory([]);
    setSelected(null);
    setAttackerSel([]);
    setReveal(null);
    setShowWhy(false);
    solve.node([]).then(setNode).catch(() => {});
  };

  // --- intro ---
  if (model === null) {
    return (
      <div className="trainer">
        <h2>Practice draft vs the bot</h2>
        <ul className="muted" style={{ margin: '0.5rem 0 1rem 1.1rem', lineHeight: 1.6 }}>
          {finalRound > 1 && (
            <li>Rounds 1–{finalRound - 1} — put up a defender, send two attackers, then refuse one of theirs; two games lock each round.</li>
          )}
          <li>Round {finalRound} — four players: the two refused attackers face each other and the last players pair automatically, resolving the remaining games.</li>
          <li>Both captains pick secretly at every step. The bot's choice is revealed only after you lock yours.</li>
          <li>At the end you're scored against the solver's pre-draft expectation.</li>
          <li>Runs entirely on your computer — your matrix and drafts are never uploaded. Hints are training-only and switch off during official WTC dates.</li>
        </ul>
        {solve.status === 'solving' && <ProgressBar frac={solve.progress} label="Solving exactly for training…" />}
        <button className="primary" disabled={!ready} onClick={start}>Start practice draft</button>
        {!ready && solve.status !== 'solving' && <span className="muted"> Solve the matrix first.</span>}
      </div>
    );
  }

  if (model.done) {
    return (
      <DraftSummary
        myTeam={myTeam}
        enemyTeam={enemyTeam}
        myNames={myNames}
        enemyNames={enemyNames}
        expected={expected}
        model={model}
        onReplay={start}
        onEditMatrix={onEditMatrix}
      />
    );
  }

  if (!node) return <p className="placeholder">Loading the next decision…</p>;

  const stage = node.stage as 'defender' | 'attackers' | 'refusal';
  // `node` is fetched asynchronously, so during an advance or undo the model's
  // round scratch can briefly disagree with the stale node. Wait for them to
  // re-sync before reading model-derived card stats / board slots (otherwise
  // candidateStats would index an unset defender or pair).
  const modelStage = model.myDefender < 0 ? 'defender' : model.myPair === null ? 'attackers' : 'refusal';
  if (stage !== modelStage) return <p className="placeholder">Loading the next decision…</p>;
  // The refusal step is framed as selecting who your defender faces (people
  // think in matchups, not refusals), so its copy needs the defender's name.
  const defenderName = myNames[model.myDefender];
  const copy =
    stage === 'refusal'
      ? {
          title: `Choose whom ${defenderName} will face`,
          sub: `Pick which of their two attackers ${defenderName} plays — the other is refused.`,
        }
      : STAGE_COPY[stage];
  // The pairing (refusal) confirm button states the matchup it locks in
  // ("X faces Y"); other stages keep the generic "Lock <stage>".
  const lockLabel =
    stage !== 'refusal'
      ? `Lock ${stage}`
      : selected !== null
        ? `${defenderName} faces ${enemyNames[model.enemyPair!.find((x) => x !== (node.choices[selected].id as number))!]}`
        : `${defenderName} faces …`;
  // In-progress picks so the board fills + highlights before the user locks.
  const pending = {
    defender: stage === 'defender' && selected !== null ? (node.choices[selected].id as number) : null,
    attackers: stage === 'attackers' ? attackerSel : [],
    face:
      stage === 'refusal' && selected !== null
        ? model.enemyPair!.find((x) => x !== (node.choices[selected].id as number))!
        : null,
  };
  const proj = projectedResult(model, node, expected);
  // EV cards + the projected header share one scale: the 0–20n team total, one
  // decimal. The best card's EV therefore equals the projected figure exactly.
  const achieved = model.fixed.reduce((sum, g) => sum + g.value, 0);
  const projScore = formatTeamScore(teamTotal(proj.projected, model.n));

  // Attackers select two individual cards (resolved to the pair NodeChoice on
  // lock); every other stage selects a single choice.
  const canLock = stage === 'attackers' ? attackerSel.length === 2 : selected !== null;

  const toggleAttacker = (idx: number) => {
    setAttackerSel((sel) =>
      sel.includes(idx)
        ? sel.filter((x) => x !== idx)
        : sel.length < 2
          ? [...sel, idx]
          : [sel[1], idx], // already two picked → drop the earliest, keep the newest
    );
  };

  const lock = () => {
    const myChoice =
      stage === 'attackers' ? pairChoiceIndex(node, attackerSel[0], attackerSel[1]) : selected ?? -1;
    if (myChoice < 0 || !node.why) return;
    const colIndex = sampleIndex(node.why.enStrategy, 'equilibrium', rng.current);
    const myLabel = joinName(node.choices[myChoice].name);
    const enemyLabel = node.why.colLabels[colIndex];
    const next = applyStep(model, node, myChoice, colIndex);
    setHistory([...history, model]);
    setModel(next);
    setSelected(null);
    setAttackerSel([]);
    setShowWhy(false);
    if (stage === 'refusal') {
      // Framed as who each defender faces: I keep the enemy attacker I didn't
      // refuse; the enemy's defender faces the friendly attacker they didn't.
      const iRefuse = node.choices[myChoice].id as number;
      const myFaces = model.enemyPair!.find((x) => x !== iRefuse)!;
      const enemyRefuses = model.myPair![colIndex];
      const enemyFaces = model.myPair!.find((x) => x !== enemyRefuses)!;
      setReveal({ mine: `face ${enemyNames[myFaces]}`, enemy: `face ${myNames[enemyFaces]}` });
    } else {
      setReveal({ mine: myLabel, enemy: enemyLabel });
    }
    if (next.done) setNode(null);
    else solve.node(next.path).then(setNode).catch(() => {});
  };

  const undo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory(history.slice(0, -1));
    setModel(prev);
    setSelected(null);
    setAttackerSel([]);
    setReveal(null);
    setShowWhy(false);
    solve.node(prev.path).then(setNode).catch(() => {});
  };

  return (
    <div className="trainer">
      <div className="trainer-topbar">
        <PhaseStepper stage={stage} />
        <div className="trainer-controls">
          <button
            className={showHints ? 'tab active' : 'tab'}
            onClick={() => setHints((h) => !h)}
            disabled={!hintsAllowed}
            title={hintsAllowed ? undefined : 'Coaching hints are off during official WTC dates'}
          >
            Hints: {showHints ? 'on' : 'off'}
          </button>
          <button
            className={showWhy ? 'tab active' : 'tab'}
            onClick={() => setShowWhy((w) => !w)}
            disabled={!node.why || !hintsAllowed}
          >
            Why
          </button>
          <button onClick={undo} disabled={history.length === 0}>↩ Undo</button>
        </div>
      </div>
      <div className="trainer-head">
        <h2>{copy.title}</h2>
        <span className="round-badge">Round {node.round} / {finalRound}</span>
        {showHints && (
          <span className="projected">
            Projected <span className="pnum">{projScore}</span>{' '}
            <span className={proj.delta >= 0 ? 'pdelta up' : 'pdelta down'}>
              {proj.delta >= 0 ? '+' : ''}
              {proj.delta.toFixed(1)} vs plan
            </span>
          </span>
        )}
      </div>
      <p className="trainer-sub">{copy.sub}</p>

      {wtcLock && (
        <div className="wtc-note">
          Coaching hints are off — <strong>{wtcLock.name}</strong> is under way. They switch back
          on automatically after the event.
        </div>
      )}

      {reveal && (
        <div className="reveal">
          <span>You: <span className="r-mine">{reveal.mine}</span></span>
          <span>{enemy}: <span className="r-enemy">{reveal.enemy}</span></span>
        </div>
      )}

      <DraftBoard model={model} myNames={myNames} enemyNames={enemyNames} pending={pending} />

      {stage === 'attackers' ? (
        <>
          <div className="choices grid">
            {attackerOptions(model, node).map((opt) => {
              const sel = attackerSel.includes(opt.index);
              return (
                <button
                  key={opt.index}
                  className={sel ? 'choice selected' : 'choice'}
                  aria-pressed={sel}
                  onClick={() => toggleAttacker(opt.index)}
                >
                  <span className="cname">
                    {myNames[opt.index]}
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
            const ci = pairChoiceIndex(node, attackerSel[0], attackerSel[1]);
            if (ci < 0) return null;
            const c = node.choices[ci];
            const bestEv = node.choices.reduce((m, ch) => Math.max(m, ch.ev), -Infinity);
            const regret = c.ev - bestEv; // ≤ 0; 0 means this pair is an equilibrium best
            return (
              <div className="pair-summary">
                <span className="ps-label">Your pair</span>
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
          {node.choices.map((choice, i) => {
            const stats = candidateStats(model, node, i);
            // Refusal cards are framed as who my defender faces: show the enemy
            // attacker I'd keep (i.e. not refuse — choice.id is the refused one).
            const faced = stage === 'refusal' ? model.enemyPair!.find((x) => x !== (choice.id as number))! : -1;
            return (
              <button
                key={i}
                className={selected === i ? 'choice selected' : 'choice'}
                onClick={() => setSelected(i)}
              >
                <span className="cname">
                  {stage === 'refusal' ? enemyNames[faced] : joinName(choice.name)}
                </span>
                <span className="cstat">
                  our map ·{' '}
                  {stage === 'refusal' ? (
                    <span className={`num band-${scoreBand(stats.avg)}`}>{stats.avg}</span>
                  ) : stats.avg === stats.floor ? (
                    <>keeps <span className={`num band-${scoreBand(stats.avg)}`}>{stats.avg}</span></>
                  ) : (
                    <>
                      avg <span className={`num band-${scoreBand(stats.avg)}`}>{stats.avg}</span>
                      {' · '}floor <span className={`num band-${scoreBand(stats.floor)}`}>{stats.floor}</span>
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
      )}

      <div className="lock-bar">
        <button className="primary" disabled={!canLock} onClick={lock}>{lockLabel}</button>
        <span className="muted">{enemy} picks simultaneously — revealed after you lock.</span>
      </div>

      {showWhy && hintsAllowed && <WhyPanel node={node} model={model} myNames={myNames} enemyNames={enemyNames} />}

      <RemainingMatchups model={model} myNames={myNames} enemyNames={enemyNames} />

      <div className="locked">
        <div className="section-head">Locked pairings ({model.fixed.length})</div>
        {model.fixed.length === 0 ? (
          <div className="pairing placeholder-pairing">{model.n} pairings remaining</div>
        ) : (
          <div className="locked-list">
            {model.fixed.map((game, i) => {
              const my = toScore(game.value);
              return (
                <div className="pairing" key={i}>
                  <span className="pmine">{myNames[game.my]}</span>
                  <span className="pscore">{my.toFixed(1)}–{(20 - my).toFixed(1)}</span>
                  <span className="penemy">{enemyNames[game.enemy]}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
