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
    myDispositions: ['', '', '', ''],
    enemyDispositions: ['', '', '', ''],
    cells: Array.from({ length: 4 }, () =>
      Array.from({ length: 4 }, () => ({ maps: ['12', '9', ''] as [string, string, string], s: '10' }))),
  };
}

describe('validateMatrix (by-map mode)', () => {
  test('a fully valid matrix has no errors', () => {
    const r = validateMatrix(valid4(), false);
    expect(r.ok).toBe(true);
    expect(r.globalErrors).toEqual([]);
    expect(r.cellErrors.flat().every((e) => e === null)).toBe(true);
  });

  test('defaults to by-map mode when no flag is passed', () => {
    expect(validateMatrix(valid4()).ok).toBe(true);
  });

  test('one filled map is enough, in any slot', () => {
    const m = valid4();
    m.cells[0][0] = { maps: ['', '14', ''], s: '10' };
    expect(validateMatrix(m, false).ok).toBe(true);
  });

  test('maps need no ordering (the solver takes max/min)', () => {
    const m = valid4();
    m.cells[0][0] = { maps: ['5', '15', '10'], s: '10' };
    expect(validateMatrix(m, false).ok).toBe(true);
  });

  test('flags an out-of-range map on the offending cell, naming the map', () => {
    const m = valid4();
    m.cells[1][2] = { maps: ['12', '25', ''], s: '15' };
    const r = validateMatrix(m, false);
    expect(r.ok).toBe(false);
    expect(r.cellErrors[1][2]).toMatch(/Map B/);
    expect(r.cellErrors[1][1]).toBeNull();
  });

  test('flags a non-integer map (a game is played on a single map)', () => {
    const m = valid4();
    m.cells[0][0] = { maps: ['12.5', '9', ''], s: '10' };
    const r = validateMatrix(m, false);
    expect(r.ok).toBe(false);
    expect(r.cellErrors[0][0]).toMatch(/Map A.*whole number/);
  });

  test('flags a cell with no map filled', () => {
    const m = valid4();
    m.cells[2][2] = { maps: ['', '', ''], s: '5' };
    const r = validateMatrix(m, false);
    expect(r.ok).toBe(false);
    expect(r.cellErrors[2][2]).toMatch(/at least one map/i);
  });

  test('ignores an invalid or blank single rating (the inactive layer)', () => {
    const m = valid4();
    m.cells = m.cells.map((row) => row.map((c) => ({ ...c, s: 'garbage' })));
    expect(validateMatrix(m, false).ok).toBe(true);
  });
});

describe('validateMatrix (single-rating mode)', () => {
  test('validates the single rating only, ignoring blank/invalid maps', () => {
    const m = valid4();
    m.cells = m.cells.map((row) => row.map(() => ({ maps: ['', 'garbage', ''] as [string, string, string], s: '11' })));
    expect(validateMatrix(m, true).ok).toBe(true);
  });

  test('flags a non-integer single rating on the offending cell only', () => {
    const m = valid4();
    m.cells[0][0] = { maps: ['12', '9', ''], s: '12.5' };
    const r = validateMatrix(m, true);
    expect(r.ok).toBe(false);
    expect(r.cellErrors[0][0]).toMatch(/whole number/i);
    expect(r.cellErrors[0][1]).toBeNull();
  });

  test('flags a blank single rating', () => {
    const m = valid4();
    m.cells[2][2] = { maps: ['12', '9', ''], s: '' };
    const r = validateMatrix(m, true);
    expect(r.ok).toBe(false);
    expect(r.cellErrors[2][2]).toBeTruthy();
  });

  test('flags an out-of-range single rating', () => {
    const m = valid4();
    m.cells[1][1] = { maps: ['12', '9', ''], s: '25' };
    expect(validateMatrix(m, true).ok).toBe(false);
  });
});

describe('validateMatrix (factions, mode-independent)', () => {
  test('allows the same faction on both teams (cross-team duplicates are fine)', () => {
    const m = valid4();
    m.myNames[0] = 'Necrons';
    m.enemyNames[0] = 'Necrons';
    const r = validateMatrix(m, false);
    expect(r.ok).toBe(true);
    expect(r.globalErrors).toEqual([]);
  });

  test('flags two players on the same team sharing a faction', () => {
    const m = valid4();
    m.myNames[0] = 'Orks';
    m.myNames[1] = 'Orks';
    const r = validateMatrix(m, false);
    expect(r.ok).toBe(false);
    expect(r.globalErrors.join(' ')).toMatch(/Orks/);
  });

  test('allows unset (empty) names — the Player N / Opponent K default', () => {
    const m = valid4();
    m.myNames = ['', '', '', ''];
    m.enemyNames = ['', '   ', '', ''];
    const r = validateMatrix(m, false);
    expect(r.ok).toBe(true);
    expect(r.globalErrors).toEqual([]);
  });

  test('flags a collision the positional fill would manufacture (validates resolved names)', () => {
    // Player 1 is explicitly "Player 2"; player 2 is unset and its positional
    // fill is also "Player 2" — a duplicate the raw-name check (which skips '')
    // would miss but toEngineMatrix would ship. Only reachable via imported data.
    const m = valid4();
    m.myNames = ['Player 2', '', 'C', 'D'];
    const r = validateMatrix(m, false);
    expect(r.ok).toBe(false);
    expect(r.globalErrors.join(' ')).toMatch(/Player 2/);
  });
});
