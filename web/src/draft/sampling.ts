/** Bot styles (docs/web-design.md §3.3) — pure client-side transforms of the
 * engine's true equilibrium strategy. The engine only ever returns the
 * equilibrium; the UI samples it. */
export type BotStyle = 'equilibrium' | 'greedy' | 'wildcard';

/** Wildcard temperature: >1 flattens the distribution toward uniform, so the
 * bot occasionally makes off-equilibrium picks a human might not expect. */
const WILDCARD_TEMPERATURE = 2;

function argmax(values: number[]): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i] > values[best]) best = i;
  return best;
}

/** Temperature-flatten: pᵢ^(1/T) renormalised. */
function flatten(probs: number[], temperature: number): number[] {
  const raised = probs.map((p) => Math.pow(Math.max(0, p), 1 / temperature));
  const total = raised.reduce((sum, w) => sum + w, 0);
  return total > 0 ? raised.map((w) => w / total) : probs;
}

/** Pick a bucket index by walking the cumulative distribution; zero-weight
 * buckets are never selected. */
function sampleFrom(weights: number[], rng: () => number): number {
  const r = rng();
  let cumulative = 0;
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (r < cumulative) return i;
  }
  return weights.length - 1; // floating-point fallthrough → last non-empty bucket
}

/** Choose an option index from an equilibrium probability vector under the
 * given bot style. `rng` is injectable for deterministic tests. */
export function sampleIndex(probs: number[], style: BotStyle, rng: () => number = Math.random): number {
  if (style === 'greedy') return argmax(probs);
  const weights = style === 'wildcard' ? flatten(probs, WILDCARD_TEMPERATURE) : probs;
  return sampleFrom(weights, rng);
}
