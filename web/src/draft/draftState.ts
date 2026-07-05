import type { Matrix, Move, NodeResult } from '../engine/types';

/** One of the 8 games fixed by the draft, with its value-model value (internal
 * scale). `my`/`enemy` are player indices. */
export interface FixedGame {
  my: number;
  enemy: number;
  kind: 'my-defends' | 'enemy-defends' | 'refused' | 'last';
  value: number;
  round: number;
}

/** A decision I made, with the regret it carries (docs/web-design.md §3.4). */
export interface DraftDecision {
  stage: 'defender' | 'attackers' | 'refusal';
  round: number;
  chosenId: number | [number, number];
  chosenName: string | [string, string];
  chosenEv: number;
  bestEv: number;
  /** Name of the max-EV option (what the equilibrium would have played). */
  bestName: string | [string, string];
  /** max(choices.ev) − ev(chosen); ≥ 0 up to LP tolerance. */
  regret: number;
}

export interface DraftModel {
  n: number;
  matrix: Matrix;
  neutralWeight: number;
  /** The move path to feed engine.nodeResult(). */
  path: Move[];
  round: number;
  finalRound: number;
  /** Ascending pools at the current point (refused attackers stay in). */
  myRemaining: number[];
  enemyRemaining: number[];
  // in-progress round scratch (−1 / null between rounds)
  myDefender: number;
  enemyDefender: number;
  myPair: [number, number] | null;
  enemyPair: [number, number] | null;
  fixed: FixedGame[];
  decisions: DraftDecision[];
  done: boolean;
}

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

function combinations(items: number[]): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i < items.length - 1; i++) {
    for (let j = i + 1; j < items.length; j++) pairs.push([items[i], items[j]]);
  }
  return pairs;
}

export function initDraft(matrix: Matrix, neutralWeight: number): DraftModel {
  const n = matrix.n;
  return {
    n,
    matrix,
    neutralWeight,
    path: [],
    round: 1,
    finalRound: (n - 4) / 2 + 1,
    myRemaining: range(n),
    enemyRemaining: range(n),
    myDefender: -1,
    enemyDefender: -1,
    myPair: null,
    enemyPair: null,
    fixed: [],
    decisions: [],
    done: false,
  };
}

/** Map the bot's sampled column index (into node.why.enStrategy) to the enemy's
 * move id, using the exact-mode ascending enumeration the engine uses
 * (nodeResult.test.ts). Refusal columns are my just-sent attacker pair. */
export function enemyMoveId(model: DraftModel, stage: NodeResult['stage'], colIndex: number): number | [number, number] {
  if (stage === 'defender') return model.enemyRemaining[colIndex];
  if (stage === 'attackers') {
    const eligible = model.enemyRemaining.filter((x) => x !== model.enemyDefender);
    return combinations(eligible)[colIndex];
  }
  return model.myPair![colIndex]; // refusal: enemy refuses one of MY attackers
}

function matchupValue(model: DraftModel, kind: FixedGame['kind'], my: number, enemy: number): number {
  const cell = model.matrix.cells[my][enemy];
  if (kind === 'my-defends') return cell.best; // I defend → my best map
  if (kind === 'enemy-defends') return cell.worst; // enemy defends → my worst map
  return cell.worst + model.neutralWeight * (cell.best - cell.worst); // refused / last → neutral
}

/** Apply one simultaneous decision: my choice (index into node.choices) + the
 * bot's sampled enemy column (index into node.why.enStrategy). Returns a new
 * model (the input is not mutated). At the refusal step it resolves the round's
 * fixed games and, on the final round, the refused-vs-refused and last-vs-last
 * games. */
export function applyStep(model: DraftModel, node: NodeResult, myIndex: number, colIndex: number): DraftModel {
  const choice = node.choices[myIndex];
  const bestChoice = node.choices.reduce((best, c) => (c.ev > best.ev ? c : best), node.choices[0]);
  const bestEv = bestChoice.ev;
  const decision: DraftDecision = {
    stage: node.stage as DraftDecision['stage'],
    round: model.round,
    chosenId: choice.id,
    chosenName: choice.name,
    chosenEv: choice.ev,
    bestEv,
    bestName: bestChoice.name,
    regret: bestEv - choice.ev,
  };

  const next: DraftModel = {
    ...model,
    path: [...model.path],
    myRemaining: [...model.myRemaining],
    enemyRemaining: [...model.enemyRemaining],
    fixed: [...model.fixed],
    decisions: [...model.decisions, decision],
  };

  if (node.stage === 'defender') {
    const my = choice.id as number;
    const enemy = enemyMoveId(model, 'defender', colIndex) as number;
    next.path.push({ stage: 'defender', my, enemy });
    next.myDefender = my;
    next.enemyDefender = enemy;
  } else if (node.stage === 'attackers') {
    const my = choice.id as [number, number];
    const enemy = enemyMoveId(model, 'attackers', colIndex) as [number, number];
    next.path.push({ stage: 'attackers', my, enemy });
    next.myPair = my;
    next.enemyPair = enemy;
  } else {
    // refusal: choice.id = the ENEMY attacker I refuse (Move.my);
    // enemyMoveId = the FRIENDLY attacker the enemy refuses (Move.enemy).
    const iRefuse = choice.id as number;
    const enemyRefuses = enemyMoveId(model, 'refusal', colIndex) as number;
    next.path.push({ stage: 'refusal', my: iRefuse, enemy: enemyRefuses });
    resolveRound(next, iRefuse, enemyRefuses);
  }

  return next;
}

/** Fix the round's games and advance (mutates the already-copied `next`). */
function resolveRound(next: DraftModel, iRefuse: number, enemyRefuses: number): void {
  const [fa, fb] = next.myPair!;
  const [ea, eb] = next.enemyPair!;
  const myKept = fa === enemyRefuses ? fb : fa; // enemy refused one of mine → keep the other
  const enemyKept = ea === iRefuse ? eb : ea; // I refused one of theirs → they keep the other
  const round = next.round;

  next.fixed.push(
    {
      my: next.myDefender, enemy: enemyKept, kind: 'my-defends', round,
      value: matchupValue(next, 'my-defends', next.myDefender, enemyKept),
    },
    {
      my: myKept, enemy: next.enemyDefender, kind: 'enemy-defends', round,
      value: matchupValue(next, 'enemy-defends', myKept, next.enemyDefender),
    },
  );

  next.myRemaining = next.myRemaining.filter((x) => x !== next.myDefender && x !== myKept);
  next.enemyRemaining = next.enemyRemaining.filter((x) => x !== next.enemyDefender && x !== enemyKept);

  if (round === next.finalRound) {
    const myRefused = enemyRefuses; // my attacker the enemy refused
    const enemyRefused = iRefuse; // enemy attacker I refused
    const myLast = next.myRemaining.find((x) => x !== myRefused)!;
    const enemyLast = next.enemyRemaining.find((x) => x !== enemyRefused)!;
    next.fixed.push(
      {
        my: myRefused, enemy: enemyRefused, kind: 'refused', round,
        value: matchupValue(next, 'refused', myRefused, enemyRefused),
      },
      {
        my: myLast, enemy: enemyLast, kind: 'last', round,
        value: matchupValue(next, 'last', myLast, enemyLast),
      },
    );
    next.done = true;
  } else {
    next.round = round + 1;
    next.myDefender = -1;
    next.enemyDefender = -1;
    next.myPair = null;
    next.enemyPair = null;
  }
}

/** Total achieved team result (internal scale) = sum of the fixed games. */
export function achievedTotal(model: DraftModel): number {
  return model.fixed.reduce((sum, game) => sum + game.value, 0);
}
