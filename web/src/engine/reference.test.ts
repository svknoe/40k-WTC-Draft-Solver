import { describe, expect, test } from 'vitest';
import { fixtureMatrix, six, smoke } from '../conformance/fixtures';
import { referenceValue } from './reference';

// The reference must reproduce the FROZEN goldens (exact solves, k === null)
// before it is trusted as the oracle for the new 3/5/7 sizes.
describe('referenceValue vs frozen fixtures', () => {
  test('agrees with the Smoke 4x4 exact golden value', () => {
    const exact = smoke.solves.find((s) => s.k === null)!;
    expect(referenceValue(fixtureMatrix(smoke), smoke.neutralWeight))
      .toBeCloseTo(exact.expectedValue, 9);
  });

  test('agrees with the Six 6x6 exact golden value', () => {
    const exact = six.solves.find((s) => s.k === null)!;
    expect(referenceValue(fixtureMatrix(six), six.neutralWeight))
      .toBeCloseTo(exact.expectedValue, 9);
  });
});
