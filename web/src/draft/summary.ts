import type { DraftDecision } from './draftState';

const REGRET_TOL = 1e-6;
/** A draft is "clean" below ~1 point of total leaks (the ±1 verdict band, §C). */
const CLEAN_THRESHOLD = 1;

export interface Decomposition {
  expected: number;
  achieved: number;
  /** achieved − expected. */
  totalDelta: number;
  /** Σ max(0, regret) over my decisions — points I left on the table. */
  totalRegret: number;
  /** totalDelta + totalRegret — reveal luck (which branch of its mix the bot
   * sampled). Per §3.4; the issue #21 comment's minus sign is a slip. */
  variance: number;
  /** My non-zero-regret decisions, worst-first. */
  leaks: DraftDecision[];
}

/** Split the delta-vs-plan into my regret and the reveal variance (§3.4). */
export function decompose(decisions: DraftDecision[], expected: number, achieved: number): Decomposition {
  const totalRegret = decisions.reduce((sum, d) => sum + Math.max(0, d.regret), 0);
  const totalDelta = achieved - expected;
  const variance = totalDelta + totalRegret;
  const leaks = decisions
    .filter((d) => d.regret > REGRET_TOL)
    .sort((a, b) => b.regret - a.regret);
  return { expected, achieved, totalDelta, totalRegret, variance, leaks };
}

export interface Verdict {
  /** Magnitude of the achieved team result. */
  result: string;
  /** The regret/variance sentence (never blames the bot when the draft is clean). */
  summary: string;
}

function resultLabel(margin: number): string {
  if (margin >= 40) return 'CRUSHING WIN';
  if (margin >= 16) return 'LARGE WIN';
  if (margin >= 1) return 'CLOSE WIN';
  if (margin === 0) return 'DEAD DRAW';
  if (margin >= -15) return 'CLOSE LOSS';
  if (margin >= -39) return 'LARGE LOSS';
  return 'CRUSHING LOSS';
}

function summaryCopy(d: Decomposition): string {
  const v = Math.round(d.variance);
  if (d.totalRegret < CLEAN_THRESHOLD) {
    if (v > 0) return `Perfect picks, and the reveals broke your way — variance +${v}.`;
    if (v < 0) return `Clean draft — unlucky reveals, variance ${v}.`;
    return 'Clean draft — it went to plan.';
  }
  const varPart = v > 0 ? ` Variance still added +${v}.` : v < 0 ? ` Variance took another ${v}.` : '';
  return `Your picks cost ${d.totalRegret.toFixed(1)} vs the equilibrium.${varPart}`;
}

export function verdict(myScore: number, enemyScore: number, decomposition: Decomposition): Verdict {
  return { result: resultLabel(myScore - enemyScore), summary: summaryCopy(decomposition) };
}

// --- two-player mode ---

export interface Decomposition2p {
  expected: number;
  achieved: number;
  /** achieved − expected. */
  totalDelta: number;
  /** Σ max(0, regret) per seat. */
  myRegret: number;
  enemyRegret: number;
  /** totalDelta + myRegret − enemyRegret — the blunder-free residual of how
   * the simultaneous pure reveals landed against each other. Nonzero even for
   * two perfect players (matching pennies: both clean, outcome still ±1);
   * zero in expectation when both seats sample their equilibrium mixes. */
  revealLuck: number;
  /** Each seat's non-zero-regret decisions, worst-first. */
  myLeaks: DraftDecision[];
  enemyLeaks: DraftDecision[];
}

/** Split a two-player draft's delta-vs-plan into each seat's regret plus the
 * reveal luck: achieved = expected − myRegret + enemyRegret + revealLuck. */
export function decompose2p(
  myDecisions: DraftDecision[],
  enemyDecisions: DraftDecision[],
  expected: number,
  achieved: number,
): Decomposition2p {
  const mine = decompose(myDecisions, expected, achieved);
  // Only `.totalRegret` / `.leaks` are read from `theirs`, and both depend on
  // the decisions alone — not on expected/achieved — so these negated args are
  // NOT load-bearing here. They're the enemy-perspective expected/achieved
  // (their value = −mine), which keeps `theirs` a self-consistent decomposition
  // should a future caller start reading its totalDelta/variance.
  const theirs = decompose(enemyDecisions, -expected, -achieved);
  const totalDelta = achieved - expected;
  return {
    expected,
    achieved,
    totalDelta,
    myRegret: mine.totalRegret,
    enemyRegret: theirs.totalRegret,
    revealLuck: totalDelta + mine.totalRegret - theirs.totalRegret,
    myLeaks: mine.leaks,
    enemyLeaks: theirs.leaks,
  };
}

function summaryCopy2p(d: Decomposition2p): string {
  const luck = Math.round(d.revealLuck);
  const luckPart =
    luck > 0 ? ` The reveals added +${luck}.` : luck < 0 ? ` The reveals took ${luck}.` : '';
  const myClean = d.myRegret < CLEAN_THRESHOLD;
  const enClean = d.enemyRegret < CLEAN_THRESHOLD;
  if (myClean && enClean) {
    if (luck > 0) return `Both seats drafted clean — the reveals broke your way, +${luck}.`;
    if (luck < 0) return `Both seats drafted clean — the reveals went against you, ${luck}.`;
    return 'Both seats drafted clean — it went to plan.';
  }
  if (myClean) {
    return `The opponent's picks cost ${d.enemyRegret.toFixed(1)} vs the equilibrium; your seat was clean.${luckPart}`;
  }
  if (enClean) {
    return `Your picks cost ${d.myRegret.toFixed(1)} vs the equilibrium; the opponent's seat was clean.${luckPart}`;
  }
  return `Your picks cost ${d.myRegret.toFixed(1)} and the opponent's cost ${d.enemyRegret.toFixed(1)} vs the equilibrium.${luckPart}`;
}

export function verdict2p(myScore: number, enemyScore: number, decomposition: Decomposition2p): Verdict {
  return { result: resultLabel(myScore - enemyScore), summary: summaryCopy2p(decomposition) };
}
