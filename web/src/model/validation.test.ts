import { describe, expect, test } from 'vitest';
import type { EditorMatrix } from './matrix';
import { validateMatrix } from './validation';

function valid4(): EditorMatrix {
  return {
    n: 4,
    myTeam: 'Norway',
    enemyTeam: 'Scotland',
    myNames: ['A', 'B', 'C', 'D'],
    enemyNames: ['W', 'X', 'Y', 'Z'],
    cells: Array.from({ length: 4 }, () =>
      Array.from({ length: 4 }, () => ({ b: '12', w: '9', s: '10' }))),
  };
}

describe('validateMatrix (best/worst mode)', () => {
  test('a fully valid matrix has no errors', () => {
    const r = validateMatrix(valid4(), false);
    expect(r.ok).toBe(true);
    expect(r.globalErrors).toEqual([]);
    expect(r.cellErrors.flat().every((e) => e === null)).toBe(true);
  });

  test('defaults to best/worst mode when no flag is passed', () => {
    expect(validateMatrix(valid4()).ok).toBe(true);
  });

  test('flags best < worst on the offending cell only', () => {
    const m = valid4();
    m.cells[0][0] = { b: '9', w: '15', s: '12' };
    const r = validateMatrix(m, false);
    expect(r.ok).toBe(false);
    expect(r.cellErrors[0][0]).toMatch(/best/i);
    expect(r.cellErrors[0][1]).toBeNull();
  });

  test('flags an out-of-range / unparseable cell', () => {
    const m = valid4();
    m.cells[1][2] = { b: '25', w: '10', s: '15' };
    const r = validateMatrix(m, false);
    expect(r.ok).toBe(false);
    expect(r.cellErrors[1][2]).toBeTruthy();
  });

  test('flags a non-integer map value (a game is played on a single map)', () => {
    const m = valid4();
    m.cells[0][0] = { b: '12.5', w: '9', s: '10' };
    const r = validateMatrix(m, false);
    expect(r.ok).toBe(false);
    expect(r.cellErrors[0][0]).toMatch(/whole number/i);
    expect(r.cellErrors[0][1]).toBeNull();
  });

  test('flags a blank (incomplete) cell', () => {
    const m = valid4();
    m.cells[2][2] = { b: '', w: '5', s: '5' };
    const r = validateMatrix(m, false);
    expect(r.ok).toBe(false);
    expect(r.cellErrors[2][2]).toBeTruthy();
  });

  test('ignores an invalid or blank single rating (the inactive layer)', () => {
    const m = valid4();
    m.cells = m.cells.map((row) => row.map((c) => ({ ...c, s: 'garbage' })));
    expect(validateMatrix(m, false).ok).toBe(true);
  });
});

describe('validateMatrix (single-rating mode)', () => {
  test('validates the single rating only, ignoring blank/invalid best/worst', () => {
    const m = valid4();
    // Wreck the inactive best/worst layer entirely — simple mode must not care.
    m.cells = m.cells.map((row) => row.map(() => ({ b: '', w: 'garbage', s: '11' })));
    expect(validateMatrix(m, true).ok).toBe(true);
  });

  test('flags a non-integer single rating on the offending cell only', () => {
    const m = valid4();
    m.cells[0][0] = { b: '12', w: '9', s: '12.5' };
    const r = validateMatrix(m, true);
    expect(r.ok).toBe(false);
    expect(r.cellErrors[0][0]).toMatch(/whole number/i);
    expect(r.cellErrors[0][1]).toBeNull();
  });

  test('flags a blank single rating', () => {
    const m = valid4();
    m.cells[2][2] = { b: '12', w: '9', s: '' };
    const r = validateMatrix(m, true);
    expect(r.ok).toBe(false);
    expect(r.cellErrors[2][2]).toBeTruthy();
  });

  test('flags an out-of-range single rating', () => {
    const m = valid4();
    m.cells[1][1] = { b: '12', w: '9', s: '25' };
    expect(validateMatrix(m, true).ok).toBe(false);
  });
});

describe('validateMatrix (names, mode-independent)', () => {
  test('flags a name shared across teams', () => {
    const m = valid4();
    m.enemyNames[0] = 'A'; // also in myNames
    const r = validateMatrix(m, false);
    expect(r.ok).toBe(false);
    expect(r.globalErrors.join(' ')).toMatch(/A/);
  });

  test('flags an empty name', () => {
    const m = valid4();
    m.myNames[1] = '   ';
    const r = validateMatrix(m, false);
    expect(r.ok).toBe(false);
    expect(r.globalErrors.length).toBeGreaterThan(0);
  });
});
