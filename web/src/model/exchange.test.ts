import { describe, expect, test } from 'vitest';
import { exportJson, importJson } from './exchange';
import type { EditorMatrix } from './matrix';

function sample(): EditorMatrix {
  return {
    n: 4,
    myTeam: 'Norway',
    enemyTeam: 'Scotland',
    myNames: ['A', 'B', 'C', 'D'],
    enemyNames: ['W', 'X', 'Y', 'Z'],
    myDispositions: ['purge', '', 'hold', ''],
    enemyDispositions: ['', '', '', 'recon'],
    cells: Array.from({ length: 4 }, () =>
      Array.from({ length: 4 }, () => ({ maps: ['12', '9', ''] as [string, string, string], s: '10' }))),
  };
}

describe('exchange', () => {
  test('exportJson carries the format/version header (v2)', () => {
    const data = JSON.parse(exportJson(sample()));
    expect(data.format).toBe('wtc-matrix');
    expect(data.version).toBe(2);
    expect(data.myNames).toEqual(['A', 'B', 'C', 'D']);
    expect(data.n).toBeUndefined(); // n is derived, not stored (§4.2)
  });

  test('importJson(exportJson(m)) round-trips maps, single rating and dispositions', () => {
    const m = sample();
    const exported = JSON.parse(exportJson(m));
    expect(exported.cells[0][0]).toEqual({ maps: ['12', '9', ''], s: '10' });
    expect(exported.myDispositions).toEqual(['purge', '', 'hold', '']);
    expect(importJson(exportJson(m))).toEqual(m);
  });

  test('a v1 export (best/worst, no single, no dispositions) imports as maps A/B', () => {
    const old = { format: 'wtc-matrix', version: 1, myTeam: '', enemyTeam: '',
      myNames: ['A', 'B', 'C', 'D'], enemyNames: ['W', 'X', 'Y', 'Z'],
      cells: Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => ({ b: '15', w: '9' }))) };
    const m = importJson(JSON.stringify(old));
    expect(m.cells[0][0]).toEqual({ maps: ['15', '9', ''], s: '12' });
    expect(m.myDispositions).toEqual(['', '', '', '']);
  });

  test('rejects non-JSON with a friendly message', () => {
    expect(() => importJson('garbage')).toThrow(
      'Could not read that file — expected a matrix JSON exported from this app.',
    );
  });

  test('rejects a file without the wtc-matrix header', () => {
    expect(() => importJson(JSON.stringify({ myNames: ['A'] }))).toThrow(/exported from this app/);
  });

  test('rejects a row-count mismatch', () => {
    const bad = { format: 'wtc-matrix', version: 2, myTeam: '', enemyTeam: '',
      myNames: ['A', 'B', 'C', 'D'], enemyNames: ['W', 'X', 'Y', 'Z'],
      cells: [[{ maps: ['1', '', ''], s: '1' }]] };
    expect(() => importJson(JSON.stringify(bad))).toThrow(/rows/);
  });
});
