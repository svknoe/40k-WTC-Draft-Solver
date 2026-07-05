import { useRef, useState } from 'react';
import type { Matrix, NodeResult } from '../engine/types';
import type { BotStyle } from '../draft/sampling';
import { sampleIndex } from '../draft/sampling';
import type { DraftModel } from '../draft/draftState';
import { applyStep, initDraft } from '../draft/draftState';
import { toScore } from '../model/scale';
import type { SolveState } from '../worker/useSolve';
import { DraftSummary } from './DraftSummary';
import { ProgressBar } from './ProgressBar';
import { WhyPanel } from './WhyPanel';
import './trainer.css';

interface DraftTrainerProps {
  matrix: Matrix;
  myTeam: string;
  enemyTeam: string;
  neutralWeight: number;
  solve: SolveState;
  botStyle: BotStyle;
  onBotStyleChange: (style: BotStyle) => void;
  onEditMatrix: () => void;
}

const STAGE_COPY = {
  defender: { title: 'Select your defender', sub: 'Both captains put up a defender at the same time.' },
  attackers: { title: 'Send two attackers', sub: 'You send two — the enemy chooses which one your defender faces.' },
  refusal: { title: 'Refuse an attacker', sub: 'Refuse one of their two attackers; your defender plays the one you keep.' },
} as const;

function joinName(name: string | [string, string]): string {
  return typeof name === 'string' ? name : `${name[0]} + ${name[1]}`;
}

export function DraftTrainer({ matrix, myTeam, enemyTeam, neutralWeight, solve, botStyle, onBotStyleChange, onEditMatrix }: DraftTrainerProps) {
  const { myNames, enemyNames } = matrix;
  const [model, setModel] = useState<DraftModel | null>(null);
  const [history, setHistory] = useState<DraftModel[]>([]);
  const [node, setNode] = useState<NodeResult | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [reveal, setReveal] = useState<{ mine: string; enemy: string } | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  const [hints, setHints] = useState(true);
  const rng = useRef<() => number>(Math.random);

  const ready = solve.status === 'done' && solve.solvedK === null;
  const expected = solve.result?.expected ?? 0;
  const finalRound = (matrix.n - 4) / 2 + 1;
  const enemy = enemyTeam || 'The bot';

  const start = () => {
    if (!ready) return;
    setModel(initDraft(matrix, neutralWeight));
    setHistory([]);
    setSelected(null);
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
  const copy = STAGE_COPY[stage];

  const lock = () => {
    if (selected === null || !node.why) return;
    const colIndex = sampleIndex(node.why.enStrategy, botStyle, rng.current);
    const myLabel = joinName(node.choices[selected].name);
    const enemyLabel = node.why.colLabels[colIndex];
    const next = applyStep(model, node, selected, colIndex);
    setHistory([...history, model]);
    setModel(next);
    setSelected(null);
    setShowWhy(false);
    setReveal(
      stage === 'refusal'
        ? { mine: `refuse ${myLabel}`, enemy: `refuse ${enemyLabel}` }
        : { mine: myLabel, enemy: enemyLabel },
    );
    if (next.done) setNode(null);
    else solve.node(next.path).then(setNode).catch(() => {});
  };

  const undo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory(history.slice(0, -1));
    setModel(prev);
    setSelected(null);
    setReveal(null);
    setShowWhy(false);
    solve.node(prev.path).then(setNode).catch(() => {});
  };

  return (
    <div className="trainer">
      <div className="trainer-head">
        <h2>{copy.title}</h2>
        <span className="round-badge">Round {node.round} / {finalRound}</span>
      </div>
      <p className="trainer-sub">{copy.sub}</p>

      <div className="trainer-controls">
        <label className="style-select">
          Bot
          <select value={botStyle} onChange={(e) => onBotStyleChange(e.target.value as BotStyle)}>
            <option value="equilibrium">Equilibrium</option>
            <option value="greedy">Greedy</option>
            <option value="wildcard">Wildcard</option>
          </select>
        </label>
        <button className={hints ? 'tab active' : 'tab'} onClick={() => setHints((h) => !h)}>
          Hints: {hints ? 'on' : 'off'}
        </button>
        <button className={showWhy ? 'tab active' : 'tab'} onClick={() => setShowWhy((w) => !w)} disabled={!node.why}>
          Why
        </button>
        <span className="spacer" />
        <button onClick={undo} disabled={history.length === 0}>↩ Undo</button>
      </div>

      {reveal && (
        <div className="reveal">
          <span>You: <span className="r-mine">{reveal.mine}</span></span>
          <span>{enemy}: <span className="r-enemy">{reveal.enemy}</span></span>
        </div>
      )}

      <div className="choices">
        {node.choices.map((choice, i) => (
          <button
            key={i}
            className={selected === i ? 'choice selected' : 'choice'}
            onClick={() => setSelected(i)}
          >
            <span className="cname">
              {stage === 'refusal' ? `Refuse ${joinName(choice.name)}` : joinName(choice.name)}
            </span>
            {hints && (
              <>
                <span className="cbar"><span style={{ width: `${Math.min(100, choice.prob * 100)}%` }} /></span>
                <span className="cprob">{(choice.prob * 100).toFixed(0)}%</span>
                <span className="cev">{choice.ev >= 0 ? '+' : ''}{choice.ev.toFixed(1)}</span>
              </>
            )}
          </button>
        ))}
      </div>

      <div className="lock-bar">
        <button className="primary" disabled={selected === null} onClick={lock}>Lock {stage}</button>
        <span className="muted">{enemy} picks simultaneously — revealed after you lock.</span>
      </div>

      {showWhy && <WhyPanel node={node} />}

      {model.fixed.length > 0 && (
        <div className="locked">
          <div className="section-head">Locked pairings ({model.fixed.length})</div>
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
        </div>
      )}
    </div>
  );
}
