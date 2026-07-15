import type { NodeResult } from '../engine/types';
import type { DraftModel } from './draftState';
import { combinations, enemyColEvs, enemyMoveId } from './draftState';
import { toScore } from '../model/scale';

/** A 0–20 score seen from the ENEMY's side: their score = 20 − mine. */
const toEnemyScore = (internal: number): number => 20 - toScore(internal);

export interface CandidateStats {
  /** Mean expected score (0–20), rounded. */
  avg: number;
  /** Worst-case (minimum) expected score (0–20). */
  floor: number;
}

const mean = (xs: number[]): number => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);

/** Decision-support stats for one choice card, on the 0–20 score scale.
 * - defender: my row over the enemy remaining pool, best map (I pick the map).
 * - attackers: the two attackers' worst-map values vs their defender (they defend
 *   the game my attackers play into).
 * - refusal: the kept matchup (my defender vs the enemy attacker I keep), best
 *   map. There is a single value here, so avg === floor. */
export function candidateStats(model: DraftModel, node: NodeResult, choiceIndex: number): CandidateStats {
  const choice = node.choices[choiceIndex];
  const cells = model.matrix.cells;

  if (node.stage === 'defender') {
    const my = choice.id as number;
    const vals = model.enemyRemaining.map((e) => toScore(cells[my][e].best));
    return { avg: mean(vals), floor: Math.min(...vals) };
  }

  if (node.stage === 'attackers') {
    const [a, b] = choice.id as [number, number];
    const d = model.enemyDefender;
    const vals = [toScore(cells[a][d].worst), toScore(cells[b][d].worst)];
    return { avg: mean(vals), floor: Math.min(...vals) };
  }

  // refusal: choice.id = the enemy attacker I refuse; my defender keeps the other.
  const refuse = choice.id as number;
  const [ea, eb] = model.enemyPair!;
  const kept = ea === refuse ? eb : ea;
  const v = toScore(cells[model.myDefender][kept].best);
  return { avg: v, floor: v };
}

/** Team margin (internal scale) if you play the best continuation from `node`,
 * plus how that compares to the solver's pre-draft equilibrium value. `expected`
 * is the root game value. At the root the best pure response equals the game
 * value, so delta is ~0; as the enemy's sampled reveals diverge from
 * equilibrium, delta tracks how far ahead/behind plan the realised draft is. */
export function projectedResult(
  model: DraftModel,
  node: NodeResult,
  expected: number,
): { projected: number; delta: number } {
  const achieved = model.fixed.reduce((sum, g) => sum + g.value, 0);
  const bestEv = node.choices.reduce((m, c) => Math.max(m, c.ev), -Infinity);
  const projected = achieved + bestEv;
  return { projected, delta: projected - expected };
}

export interface AttackerOption {
  /** Player index (matrix row / myNames position). */
  index: number;
  /** Worst-map expected score (0–20) vs the enemy defender. They defend the
   * game my attackers play into, so this is my worst map. */
  rating: number;
  /** Marginal equilibrium probability this attacker is one of the two sent: the
   * summed weight of every offered pair that contains it (0–1). Across all
   * attackers these sum to 2 (each pair sends two). */
  sendProb: number;
}

/** Per-attacker cards for the attackers stage. Each eligible attacker (the union
 * of the offered pairs, ascending) with its worst-map rating vs the enemy
 * defender and its marginal send probability. The equilibrium mixes over *pairs*
 * (node.choices); the marginal reads better on independent cards than the raw
 * pair weights. Empty off the attackers stage. */
export function attackerOptions(model: DraftModel, node: NodeResult): AttackerOption[] {
  if (node.stage !== 'attackers') return [];
  const d = model.enemyDefender;
  const cells = model.matrix.cells;
  const sent = new Map<number, number>();
  for (const c of node.choices) {
    const [a, b] = c.id as [number, number];
    sent.set(a, (sent.get(a) ?? 0) + c.prob);
    sent.set(b, (sent.get(b) ?? 0) + c.prob);
  }
  return [...sent.keys()]
    .sort((x, y) => x - y)
    .map((index) => ({ index, rating: toScore(cells[index][d].worst), sendProb: sent.get(index)! }));
}

/** The opponent seat's view of a node (two-player mode), one entry per engine
 * column — the array index IS the column index applyStep takes. Everything is
 * in the ENEMY's perspective: prob is their equilibrium weight, ev their value
 * of the column vs my equilibrium mix. At the refusal stage the id/name is the
 * FRIENDLY attacker they refuse (the UI frames it as whom their defender
 * faces, like the friendly side). Empty when the node carries no `why`. */
export interface EnemyChoice {
  id: number | [number, number];
  name: string | [string, string];
  prob: number;
  ev: number;
}

export function enemyChoices(model: DraftModel, node: NodeResult): EnemyChoice[] {
  if (!node.why) return [];
  const evs = enemyColEvs(node.why);
  const { myNames, enemyNames } = model.matrix;
  const colLabels = node.why.colLabels;
  return node.why.enStrategy.map((prob, j) => {
    const id = enemyMoveId(model, node.stage, j);
    const name =
      node.stage === 'refusal'
        ? myNames[id as number]
        : typeof id === 'number'
          ? enemyNames[id]
          : ([enemyNames[id[0]], enemyNames[id[1]]] as [string, string]);
    // Tripwire: enemyMoveId rebuilds columns as combinations(ascending eligible),
    // which equals the engine's enumeration ONLY for an exact solve. Under a
    // k-restriction the eligible attacker list is *ranked* (engine.ts
    // attackerPairs), the orderings diverge, and every enemy-seat helper here
    // and enemyPairColIndex would silently mislabel the opponent's whole draft.
    // The trainer gates two-player drafts on an exact solve (DraftTrainer's
    // `solvedK === null`); this render-path check turns a loosened gate into a
    // loud failure instead of silent corruption. `label` mirrors the engine's
    // colLabel format (engine.ts joinName), so it must match column-for-column.
    const label = typeof name === 'string' ? name : `${name[0]} + ${name[1]}`;
    if (label !== colLabels[j]) {
      throw new Error(
        `Enemy column ${j} at the ${node.stage} stage reconstructed as "${label}" but the ` +
          `engine labelled it "${colLabels[j]}" — two-player mode requires an exact solve (see ` +
          `DraftTrainer's solvedK === null gate).`,
      );
    }
    return { id, name, prob, ev: evs[j] };
  });
}

/** enemy-side candidateStats: the same decision-support stats, from the
 * opponent's perspective (their score = 20 − mine, maps mirrored).
 * - defender: candidate enemy defender vs my remaining pool — those games play
 *   on THEIR best map, which is my worst.
 * - attackers: their pair vs my defender — my-defends games, my best map.
 * - refusal: the kept friendly attacker vs their defender (single value). */
export function enemyCandidateStats(model: DraftModel, node: NodeResult, colIndex: number): CandidateStats {
  const cells = model.matrix.cells;
  const id = enemyMoveId(model, node.stage, colIndex);

  if (node.stage === 'defender') {
    const e = id as number;
    const vals = model.myRemaining.map((m) => toEnemyScore(cells[m][e].worst));
    return { avg: mean(vals), floor: Math.min(...vals) };
  }

  if (node.stage === 'attackers') {
    const [a, b] = id as [number, number];
    const d = model.myDefender;
    const vals = [toEnemyScore(cells[d][a].best), toEnemyScore(cells[d][b].best)];
    return { avg: mean(vals), floor: Math.min(...vals) };
  }

  // refusal: they refuse one of MY sent pair; their defender keeps the other.
  const refuse = id as number;
  const kept = model.myPair![0] === refuse ? model.myPair![1] : model.myPair![0];
  const v = toEnemyScore(cells[kept][model.enemyDefender].worst);
  return { avg: v, floor: v };
}

/** enemy-side attackerOptions: per eligible enemy attacker, their flipped
 * rating vs MY defender and their marginal send probability (summed
 * enStrategy over the columns whose pair contains the attacker). */
export function enemyAttackerOptions(model: DraftModel, node: NodeResult): AttackerOption[] {
  if (node.stage !== 'attackers' || !node.why) return [];
  const d = model.myDefender;
  const cells = model.matrix.cells;
  const sent = new Map<number, number>();
  node.why.enStrategy.forEach((p, j) => {
    const [a, b] = enemyMoveId(model, 'attackers', j) as [number, number];
    sent.set(a, (sent.get(a) ?? 0) + p);
    sent.set(b, (sent.get(b) ?? 0) + p);
  });
  return [...sent.keys()]
    .sort((x, y) => x - y)
    .map((index) => ({ index, rating: toEnemyScore(cells[d][index].best), sendProb: sent.get(index)! }));
}

/** Column index of the enemy pair equal to the unordered {x, y} — the mirror
 * of pairChoiceIndex, over the engine's ascending enemy-pair enumeration. −1
 * when the pair isn't a column (e.g. it includes their defender). Like
 * enemyMoveId this assumes the exact-mode ascending enumeration; the divergence
 * under a k-restriction is caught by the tripwire in enemyChoices (which shares
 * this reconstruction and renders every step before a lock is possible). */
export function enemyPairColIndex(model: DraftModel, x: number, y: number): number {
  const eligible = model.enemyRemaining.filter((v) => v !== model.enemyDefender);
  const lo = Math.min(x, y);
  const hi = Math.max(x, y);
  return combinations(eligible).findIndex(([a, b]) => a === lo && b === hi);
}

/** Index into node.choices of the offered pair equal to the unordered {x, y}, or
 * −1 if that pair isn't offered (only possible under k-restriction; an exact
 * solve offers every pair). */
export function pairChoiceIndex(node: NodeResult, x: number, y: number): number {
  const lo = Math.min(x, y);
  const hi = Math.max(x, y);
  return node.choices.findIndex((c) => {
    const [a, b] = c.id as [number, number];
    return Math.min(a, b) === lo && Math.max(a, b) === hi;
  });
}
