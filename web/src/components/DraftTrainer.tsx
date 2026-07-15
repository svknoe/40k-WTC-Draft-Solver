import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Matrix, NodeResult } from '../engine/types';
import { sampleIndex } from '../draft/sampling';
import type { DraftModel, FixedGame } from '../draft/draftState';
import { applyStep, endgameNOf, enemyMoveId, finalRoundOf, initDraft } from '../draft/draftState';
import { enemyPairColIndex, pairChoiceIndex, projectedResult } from '../draft/cards';
import { formatMatchupScore, formatTeamScore, teamTotal, toScore } from '../model/scale';
import { activeWtcEvent } from '../model/wtcDates';
import type { SolveState } from '../worker/useSolve';
import { ChoicePanel } from './ChoicePanel';
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
  /** Trigger an exact solve on demand (from "Start practice draft"). */
  onSolve: () => void;
  onEditMatrix: () => void;
  /** Notifies the app when a draft is in progress (not done), so it can lock the
   * Matrix tab while the draft depends on its numbers. */
  onLiveChange?: (live: boolean) => void;
}

const STAGE_COPY = {
  defender: { title: 'Select your defender', sub: 'Both captains put up a defender at the same time.' },
  attackers: { title: 'Send two attackers', sub: 'You send two — the enemy chooses which one your defender faces.' },
} as const;

// Two-player mode covers both seats' picks in one step, so its copy speaks of
// both sides at every stage (including the refusal, which the bot mode frames
// around the one human defender).
const STAGE_COPY_2P = {
  defender: { title: 'Select both defenders', sub: 'Pick each team’s defender — in a real draft they reveal simultaneously.' },
  attackers: { title: 'Send two attackers each', sub: 'Pick the two attackers each side sends against the opposing defender.' },
  refusal: { title: 'Choose whom each defender faces', sub: 'For each side, pick which opposing attacker its defender plays — the other is refused.' },
} as const;

// Which map a resolved game is played on: the defender picks it, so my-defends
// is my best map and enemy-defends is theirs (my worst); the refused / last
// games have no defender (a 50/50 best↔worst average), so they're neutral.
const MAP_LABEL: Record<FixedGame['kind'], string> = {
  'my-defends': 'your map',
  'enemy-defends': 'their map',
  refused: 'neutral',
  last: 'neutral',
};

export function DraftTrainer({ matrix, myTeam, enemyTeam, neutralWeight, solve, onSolve, onEditMatrix, onLiveChange }: DraftTrainerProps) {
  const { myNames, enemyNames } = matrix;
  const [model, setModel] = useState<DraftModel | null>(null);
  const [history, setHistory] = useState<DraftModel[]>([]);
  const [node, setNode] = useState<NodeResult | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  // Attackers stage only: the (≤2) individually-picked attacker indices. Other
  // stages select a single choice via `selected`.
  const [attackerSel, setAttackerSel] = useState<number[]>([]);
  // Two-player mode: one human picks for both seats (no bot sampling). Chosen
  // on the intro and fixed once a draft is live; captured into the model.
  const [twoPlayer, setTwoPlayer] = useState(false);
  // The opponent seat's in-progress picks (two-player mode only). Mirrors
  // selected/attackerSel; enemySelected is an engine COLUMN index.
  const [enemySelected, setEnemySelected] = useState<number | null>(null);
  const [enemyAttackerSel, setEnemyAttackerSel] = useState<number[]>([]);
  const [hints, setHints] = useState(true);
  // Set by "Start practice draft"; the draft begins once the on-demand solve is
  // ready. Keeps the solve off the tab-open path.
  const [wantStart, setWantStart] = useState(false);
  const rng = useRef<() => number>(Math.random);

  const ready = solve.status === 'done' && solve.solvedK === null;
  const expected = solve.result?.expected ?? 0;
  const finalRound = finalRoundOf(matrix.n);
  const enemy = enemyTeam || 'The bot';
  // Coaching hints (per-choice strategy/EV + the Why panel) auto-disable during
  // official WTC dates so the app can't be used at the table (the About copy).
  const wtcLock = activeWtcEvent(new Date());
  const hintsAllowed = wtcLock === null;
  const showHints = hints && hintsAllowed;

  // "Start practice draft" kicks off the exact solve on demand (it no longer
  // runs when the Trainer tab opens); the draft begins once the values land.
  const start = () => {
    if (!ready) onSolve();
    setWantStart(true);
  };
  useEffect(() => {
    if (!(ready && wantStart)) return;
    setWantStart(false);
    setModel(initDraft(matrix, neutralWeight, twoPlayer));
    setHistory([]);
    setSelected(null);
    setAttackerSel([]);
    setEnemySelected(null);
    setEnemyAttackerSel([]);
    solve.node([]).then(setNode).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, wantStart]);

  // A draft is "live" once it exists and isn't finished. The app lifts this to
  // lock the Matrix tab (its numbers must stay fixed for the running draft).
  const isLive = model !== null && !model.done;
  useEffect(() => {
    onLiveChange?.(isLive);
  }, [isLive, onLiveChange]);

  // The mode toggle renders on the intro (where the mode is chosen) and in the
  // live topbar (where it shows the fixed mode, disabled — a draft is purely
  // one mode so the summary decomposition stays well-defined).
  const modeToggle = (
    <button
      className={twoPlayer ? 'tab active' : 'tab'}
      onClick={() => setTwoPlayer((v) => !v)}
      disabled={isLive}
      title={isLive ? 'The opponent mode is fixed while a draft is in progress' : 'Play the opponent seat yourself instead of the bot'}
    >
      Opponent: {twoPlayer ? 'you' : 'bot'}
    </button>
  );

  // --- intro ---
  if (model === null) {
    return (
      <div className="trainer">
        <h2>{twoPlayer ? 'Practice draft — you play both sides' : 'Practice draft vs the bot'}</h2>
        <ul className="muted" style={{ margin: '0.5rem 0 1rem 1.1rem', lineHeight: 1.6 }}>
          {finalRound > 1 && (
            <li>Rounds 1–{finalRound - 1} — put up a defender, send two attackers, then refuse one of theirs; two games lock each round.</li>
          )}
          {endgameNOf(matrix.n) === 3 ? (
            <li>Round {finalRound} — three players: the two non-defenders are your attackers (no choice to make), each side refuses one, and the refused attackers face each other, resolving the remaining games.</li>
          ) : (
            <li>Round {finalRound} — four players: the two refused attackers face each other and the last players pair automatically, resolving the remaining games.</li>
          )}
          {twoPlayer ? (
            <li>You make every pick for both teams — choose each seat's move, then lock them in together. In a real draft the picks are simultaneous.</li>
          ) : (
            <li>Both captains pick secretly at every step. The bot's choice is revealed only after you lock yours.</li>
          )}
          <li>At the end you're scored against the solver's pre-draft expectation.</li>
          <li>Runs entirely on your computer — your matrix and drafts are never uploaded. Hints are training-only and switch off during official WTC dates.</li>
        </ul>
        {solve.status === 'solving' && <ProgressBar frac={solve.progress} label="Solving exactly for training…" />}
        <div className="intro-actions">
          {modeToggle}
          <button className="primary" disabled={solve.status === 'solving'} onClick={start}>Start practice draft</button>
          {solve.status === 'error' && <span className="muted">Solve failed — {solve.error}</span>}
        </div>
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
        extraActions={modeToggle}
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
  // Two-player copy covers both seats' picks instead.
  const defenderName = myNames[model.myDefender];
  const copy = model.twoPlayer
    ? STAGE_COPY_2P[stage]
    : stage === 'refusal'
      ? {
          title: `Choose whom ${defenderName} will face`,
          sub: `Pick which of their two attackers ${defenderName} plays — the other is refused.`,
        }
      : STAGE_COPY[stage];
  // The pairing (refusal) confirm button states the matchup it locks in
  // ("X faces Y"); other stages keep the generic "Lock <stage>". Two-player
  // locks both seats' pairings at once, so it stays generic there.
  const lockLabel =
    stage !== 'refusal'
      ? `Lock ${stage}`
      : model.twoPlayer
        ? 'Lock pairings'
        : selected !== null
          ? `${defenderName} faces ${enemyNames[model.enemyPair!.find((x) => x !== (node.choices[selected].id as number))!]}`
          : `${defenderName} faces …`;
  // In-progress picks so the board fills + highlights before the user locks.
  // The enemy fields are two-player mode only (the bot's pick has no preview).
  const pending = {
    defender: stage === 'defender' && selected !== null ? (node.choices[selected].id as number) : null,
    attackers: stage === 'attackers' ? attackerSel : [],
    face:
      stage === 'refusal' && selected !== null
        ? model.enemyPair!.find((x) => x !== (node.choices[selected].id as number))!
        : null,
    enemyDefender:
      model.twoPlayer && stage === 'defender' && enemySelected !== null
        ? (enemyMoveId(model, 'defender', enemySelected) as number)
        : null,
    enemyAttackers: model.twoPlayer && stage === 'attackers' ? enemyAttackerSel : [],
    enemyFace:
      model.twoPlayer && stage === 'refusal' && enemySelected !== null
        ? model.myPair!.find((x) => x !== (enemyMoveId(model, 'refusal', enemySelected) as number))!
        : null,
  };
  const proj = projectedResult(model, node, expected);
  // EV cards + the projected header share one scale: the 0–20n team total, one
  // decimal. The best card's EV therefore equals the projected figure exactly.
  const projScore = formatTeamScore(teamTotal(proj.projected, model.n));

  // Attackers select two individual cards (resolved to the pair NodeChoice on
  // lock); every other stage selects a single choice. Two-player mode needs
  // the opponent seat's pick(s) complete too.
  const mySideReady = stage === 'attackers' ? attackerSel.length === 2 : selected !== null;
  const enemySideReady =
    !model.twoPlayer || (stage === 'attackers' ? enemyAttackerSel.length === 2 : enemySelected !== null);
  const canLock = mySideReady && enemySideReady;

  const toggle = (setSel: Dispatch<SetStateAction<number[]>>) => (idx: number) => {
    setSel((sel) =>
      sel.includes(idx)
        ? sel.filter((x) => x !== idx)
        : sel.length < 2
          ? [...sel, idx]
          : [sel[1], idx], // already two picked → drop the earliest, keep the newest
    );
  };
  const toggleAttacker = toggle(setAttackerSel);
  const toggleEnemyAttacker = toggle(setEnemyAttackerSel);

  const clearSelections = () => {
    setSelected(null);
    setAttackerSel([]);
    setEnemySelected(null);
    setEnemyAttackerSel([]);
  };

  const lock = () => {
    const myChoice =
      stage === 'attackers' ? pairChoiceIndex(node, attackerSel[0], attackerSel[1]) : selected ?? -1;
    if (myChoice < 0 || !node.why) return;
    // The enemy column: the human's pick in two-player mode, a sample from the
    // equilibrium mix otherwise (the bot).
    const colIndex = model.twoPlayer
      ? stage === 'attackers'
        ? enemyPairColIndex(model, enemyAttackerSel[0], enemyAttackerSel[1])
        : enemySelected ?? -1
      : sampleIndex(node.why.enStrategy, 'equilibrium', rng.current);
    if (colIndex < 0) return;
    const next = applyStep(model, node, myChoice, colIndex);
    setHistory([...history, model]);
    setModel(next);
    clearSelections();
    if (next.done) setNode(null);
    else solve.node(next.path).then(setNode).catch(() => {});
  };

  // Fill in the pending selection(s) with a choice sampled from the
  // equilibrium — the same distribution the bot samples. In two-player mode
  // both seats are filled, each from its own mix. Doesn't lock; each click
  // re-samples.
  const autoPick = () => {
    const i = sampleIndex(node.choices.map((c) => c.prob), 'equilibrium', rng.current);
    if (stage === 'attackers') {
      // node.choices are *pairs*; the pending state holds the two individual
      // attacker player-indices, so unpack the sampled pair's id into attackerSel.
      const [a, b] = node.choices[i].id as [number, number];
      setAttackerSel([a, b]);
    } else {
      setSelected(i); // defender / refusal are single-select: index into node.choices
    }
    if (model.twoPlayer && node.why) {
      const j = sampleIndex(node.why.enStrategy, 'equilibrium', rng.current);
      if (stage === 'attackers') {
        const [a, b] = enemyMoveId(model, 'attackers', j) as [number, number];
        setEnemyAttackerSel([a, b]);
      } else {
        setEnemySelected(j);
      }
    }
  };

  const undo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory(history.slice(0, -1));
    setModel(prev);
    clearSelections();
    solve.node(prev.path).then(setNode).catch(() => {});
  };

  return (
    <div className="trainer">
      <div className="trainer-topbar">
        <PhaseStepper stage={stage} />
        <div className="trainer-controls">
          {modeToggle}
          <button
            className={showHints ? 'tab active' : 'tab'}
            onClick={() => setHints((h) => !h)}
            disabled={!hintsAllowed}
            title={hintsAllowed ? undefined : 'Coaching hints are off during official WTC dates'}
          >
            Hints: {showHints ? 'on' : 'off'}
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

      <DraftBoard model={model} myNames={myNames} enemyNames={enemyNames} pending={pending} />

      {model.twoPlayer ? (
        <>
          <ChoicePanel
            model={model} node={node} side="my" showHints={showHints}
            selected={selected} attackerSel={attackerSel}
            onSelect={setSelected} onToggleAttacker={toggleAttacker}
            label={myTeam || 'Your team'}
          />
          <ChoicePanel
            model={model} node={node} side="enemy" showHints={showHints}
            selected={enemySelected} attackerSel={enemyAttackerSel}
            onSelect={setEnemySelected} onToggleAttacker={toggleEnemyAttacker}
            label={enemyTeam || 'Opponent'}
          />
        </>
      ) : (
        <ChoicePanel
          model={model} node={node} side="my" showHints={showHints}
          selected={selected} attackerSel={attackerSel}
          onSelect={setSelected} onToggleAttacker={toggleAttacker}
        />
      )}

      <div className="lock-bar">
        {showHints && (
          <button onClick={autoPick} title="Fill in a choice at random, weighted by the equilibrium strategy">
            Auto pick
          </button>
        )}
        <button className="primary" disabled={!canLock} onClick={lock}>{lockLabel}</button>
        <span className="muted">
          {model.twoPlayer
            ? 'You pick for both seats — the moves lock together.'
            : `${enemy} picks simultaneously — revealed after you lock.`}
        </span>
      </div>

      {showHints && <WhyPanel node={node} model={model} />}

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
                  <span className="pscore">{formatMatchupScore(my)}–{formatMatchupScore(20 - my)}</span>
                  <span className="penemy">{enemyNames[game.enemy]}</span>
                  <span className="pkind">{MAP_LABEL[game.kind]}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
