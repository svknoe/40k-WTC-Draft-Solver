import { describe, expect, test } from 'vitest';
import { SAMPLES } from './samples';
import { validateMatrix } from './validation';

describe('SAMPLES', () => {
  test('exposes a ready 8×8 (Scotland) and a 4×4 (Smoke)', () => {
    const sizes = SAMPLES.map((s) => s.matrix.n);
    expect(sizes).toContain(8);
    expect(sizes).toContain(4);
  });

  test('every sample is a fully valid, solvable matrix on the 0-20 scale', () => {
    for (const sample of SAMPLES) {
      const result = validateMatrix(sample.matrix);
      expect(result.ok, `${sample.key}: ${result.globalErrors.join('; ')}`).toBe(true);
      // cells are numeric 0-20 strings
      for (const row of sample.matrix.cells) {
        for (const cell of row) {
          expect(Number.isFinite(Number(cell.b))).toBe(true);
          expect(Number.isFinite(Number(cell.w))).toBe(true);
        }
      }
    }
  });
});
