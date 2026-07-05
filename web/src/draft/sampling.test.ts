import { describe, expect, test } from 'vitest';
import { sampleIndex } from './sampling';

describe('sampleIndex', () => {
  test('greedy picks the argmax probability', () => {
    expect(sampleIndex([0.2, 0.5, 0.3], 'greedy')).toBe(1);
    expect(sampleIndex([0.6, 0.4], 'greedy')).toBe(0);
  });

  test('equilibrium samples from the cumulative distribution', () => {
    const probs = [0.5, 0.0, 0.5];
    expect(sampleIndex(probs, 'equilibrium', () => 0)).toBe(0); // first positive-prob bucket
    expect(sampleIndex(probs, 'equilibrium', () => 0.75)).toBe(2); // past the first 0.5
    expect(sampleIndex(probs, 'equilibrium', () => 0.999)).toBe(2); // last positive bucket
  });

  test('equilibrium never lands on a zero-probability option', () => {
    const probs = [0.0, 1.0, 0.0];
    for (const r of [0, 0.3, 0.6, 0.999]) {
      expect(sampleIndex(probs, 'equilibrium', () => r)).toBe(1);
    }
  });

  test('wildcard flattens, so a low-prob option can be picked where equilibrium would not', () => {
    const probs = [0.95, 0.05];
    // At r just below 0.95, equilibrium picks index 0; wildcard's flattened
    // distribution gives index 1 a much wider band, so it's chosen here.
    expect(sampleIndex(probs, 'equilibrium', () => 0.9)).toBe(0);
    expect(sampleIndex(probs, 'wildcard', () => 0.9)).toBe(1);
  });
});
