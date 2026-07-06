import type { NodeResult } from '../engine/types';
import type { DraftModel } from './draftState';
import { toScore } from '../model/scale';

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
