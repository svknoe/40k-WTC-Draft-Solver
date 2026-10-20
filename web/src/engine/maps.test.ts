import { describe, expect, test } from 'vitest';
import { bestMapIndex, bestOf, cellFromBestWorst, hasMapIdentity, neutralOf, playedMap, worstMapIndex, worstOf } from './maps';
import type { GameKind } from './maps';
import type { Matrix } from './types';

describe('map helpers', () => {
  test('best/worst skip unrated maps and take the first letter on a tie', () => {
    expect(bestMapIndex([3, 5, 5])).toBe(1);
    expect(worstMapIndex([2, 2, 9])).toBe(0);
    expect(bestMapIndex([null, -1, null])).toBe(1);
    expect(worstMapIndex([4, null, 1])).toBe(2);
    expect(bestOf({ maps: [1, null, 7] })).toBe(7);
    expect(worstOf({ maps: [1, null, 7] })).toBe(1);
  });

  test('a matchup with no rated map throws', () => {
    expect(() => bestMapIndex([null, null, null])).toThrow(RangeError);
  });

  test('cellFromBestWorst keeps best/worst', () => {
    const cell = cellFromBestWorst(4, -2);
    expect([bestOf(cell), worstOf(cell)]).toEqual([4, -2]);
  });

  const one = (maps: [number | null, number | null, number | null], neutralMap: Matrix['neutralMap']): Matrix =>
    ({ n: 3, myNames: [], enemyNames: [], cells: [[{ maps }]], neutralMap });

  test('neutralOf reads the neutral map, or the weighted midpoint without identity', () => {
    expect(neutralOf(one([6, -2, 1], 'C'), 0, 0, 0.5)).toBe(1);
    expect(neutralOf(one([6, -2, 1], 'A'), 0, 0, 0.5)).toBe(6);
    expect(neutralOf(one([6, -2, 1], null), 0, 0, 0.5)).toBe(2); // -2 + 0.5 * 8
    expect(neutralOf(one([6, -2, 1], null), 0, 0, 0)).toBe(-2);
    expect(() => neutralOf(one([6, -2, null], 'C'), 0, 0, 0.5)).toThrow(RangeError);
  });

  test('playedMap: my best map when I defend, my worst when they do, the neutral map otherwise', () => {
    const m = one([3, 8, 5], 'C');
    const kinds: GameKind[] = ['my-defends', 'enemy-defends', 'refused', 'last'];
    expect(kinds.map((k) => playedMap(m, 0, 0, k))).toEqual(['B', 'A', 'C', 'C']);
  });

  test('playedMap is null for every kind when the maps carry no identity', () => {
    const m = one([3, 8, 5], null);
    for (const k of ['my-defends', 'enemy-defends', 'refused', 'last'] as const) {
      expect(playedMap(m, 0, 0, k)).toBeNull();
    }
  });

  test('hasMapIdentity is true exactly when a neutral map is set', () => {
    expect(hasMapIdentity(one([3, 8, 5], 'A'))).toBe(true);
    expect(hasMapIdentity(one([3, 8, 5], null))).toBe(false);
  });
});
