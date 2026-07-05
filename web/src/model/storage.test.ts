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
      Array.from({ length: 4 }, () => ({ b: '12', w: '9' }))),
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
});
