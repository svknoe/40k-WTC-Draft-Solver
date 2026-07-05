import { describe, expect, test } from 'vitest';
import { SAMPLES } from './samples';
import { validateMatrix } from './validation';

describe('SAMPLES', () => {
  test('leads with Template, then sizes; includes an 8×8 and a 4×4', () => {
    expect(SAMPLES[0].key).toBe('template');
    const sizes = SAMPLES.map((s) => s.matrix.n);
    expect(sizes).toContain(8);
    expect(sizes).toContain(4);
  });

  test('Template is a blank even 8×8 with dummy names', () => {
    const t = SAMPLES.find((s) => s.key === 'template')!.matrix;
    expect(t.n).toBe(8);
    expect(t.myNames[0]).toBe('Player 1');
    for (const row of t.cells) for (const cell of row) expect(cell).toEqual({ b: '10', w: '10' });
  });

  test('every sample is a fully valid, solvable matrix on the 0-20 scale', () => {
    for (const sample of SAMPLES) {
      const result = validateMatrix(sample.matrix);
      expect(result.ok, `${sample.key}: ${result.globalErrors.join('; ')}`).toBe(true);
      for (const row of sample.matrix.cells) {
        for (const cell of row) {
          expect(Number.isFinite(Number(cell.b))).toBe(true);
          expect(Number.isFinite(Number(cell.w))).toBe(true);
        }
      }
    }
  });

  test('samples label players with factions, not people (e.g. Space Marines)', () => {
    const eight = SAMPLES.find((s) => s.key === 'eight')!.matrix;
    expect(eight.myNames).toContain('Space Marines');
    expect(eight.enemyNames).toContain('Necrons');
  });

  test('every opponent is named "Opposing team"; examples are labelled NvN', () => {
    for (const s of SAMPLES) expect(s.matrix.enemyTeam).toBe('Opposing team');
    const label = (key: string) => SAMPLES.find((s) => s.key === key)?.label;
    expect(label('eight')).toBe('8v8 example');
    expect(label('six')).toBe('6v6 example');
    expect(label('four')).toBe('4v4 example');
  });
});
