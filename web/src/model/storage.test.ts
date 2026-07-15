// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from 'vitest';
import type { EditorMatrix } from './matrix';
import { loadState, saveState } from './storage';

function sample(): EditorMatrix {
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

describe('storage', () => {
  beforeEach(() => localStorage.clear());

  test('loadState returns defaults on empty storage', () => {
    const s = loadState();
    expect(s.current).toBeNull();
    expect(s.settings.cb).toBe(false);
    expect(s.settings.simpleMode).toBe(true);
    expect(s.saves).toEqual({});
  });

  test('saveState/loadState round-trips settings, current, and named saves', () => {
    const m = sample();
    saveState({ settings: { cb: true, simpleMode: false }, saves: { v1: m }, current: m });
    const s = loadState();
    expect(s.current).toEqual(m); // cell strings preserved verbatim
    expect(s.settings).toEqual({ cb: true, simpleMode: false });
    expect(s.saves).toEqual({ v1: m });
  });

  test('loadState tolerates corrupt storage', () => {
    localStorage.setItem('wtcDraftTrainer', '{ not json');
    expect(loadState().current).toBeNull();
  });

  test('loadState backfills a missing single rating from a previous build', () => {
    // A blob written before the single-rating field existed: cells carry only
    // b/w. Loading must derive a sensible single so simple mode works at once.
    const old = {
      cb: false, simpleModeV2: true,
      saves: {},
      current: {
        myTeam: '', enemyTeam: '',
        myNames: ['A', 'B', 'C', 'D'], enemyNames: ['W', 'X', 'Y', 'Z'],
        cells: Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => ({ b: '15', w: '9' }))),
      },
    };
    localStorage.setItem('wtcDraftTrainer', JSON.stringify(old));
    expect(loadState().current?.cells[0][0]).toEqual({ b: '15', w: '9', s: '12' }); // (15+9)/2 = 12
  });
});
