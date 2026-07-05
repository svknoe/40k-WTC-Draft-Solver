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
    cells: Array.from({ length: 4 }, () =>
      Array.from({ length: 4 }, () => ({ b: '12', w: '9' }))),
  };
}

describe('exchange', () => {
  test('exportJson carries the format/version header', () => {
    const data = JSON.parse(exportJson(sample()));
    expect(data.format).toBe('wtc-matrix');
    expect(data.version).toBe(1);
    expect(data.myNames).toEqual(['A', 'B', 'C', 'D']);
    expect(data.n).toBeUndefined(); // n is derived, not stored (§4.2)
  });

  test('importJson(exportJson(m)) round-trips', () => {
    const m = sample();
    expect(importJson(exportJson(m))).toEqual(m);
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
    const bad = { format: 'wtc-matrix', version: 1, myTeam: '', enemyTeam: '',
      myNames: ['A', 'B', 'C', 'D'], enemyNames: ['W', 'X', 'Y', 'Z'],
      cells: [[{ b: '1', w: '1' }]] };
    expect(() => importJson(JSON.stringify(bad))).toThrow(/rows/);
  });
});
