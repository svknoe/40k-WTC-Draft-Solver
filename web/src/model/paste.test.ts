import { describe, expect, test } from 'vitest';
import { parsePaste } from './paste';

describe('parsePaste', () => {
  test('best/worst cells ("15/12") backfill the single rating, tab-separated', () => {
    const grid = parsePaste('15/12\t11/8\n9/7\t13/10', 2);
    expect(grid).toEqual([
      [{ b: '15', w: '12', s: '14' }, { b: '11', w: '8', s: '10' }], // 13.5 -> 14, 9.5 -> 10
      [{ b: '9', w: '7', s: '8' }, { b: '13', w: '10', s: '12' }], // 8, 11.5 -> 12
    ]);
  });

  test('single numbers fill best, worst AND single, comma-separated', () => {
    const grid = parsePaste('13,14\n9,10', 2);
    expect(grid).toEqual([
      [{ b: '13', w: '13', s: '13' }, { b: '14', w: '14', s: '14' }],
      [{ b: '9', w: '9', s: '9' }, { b: '10', w: '10', s: '10' }],
    ]);
  });

  test('2n plain numbers per row are read as best/worst alternating and backfill the single', () => {
    const grid = parsePaste('15,12,11,8\n9,7,13,10', 2);
    expect(grid).toEqual([
      [{ b: '15', w: '12', s: '14' }, { b: '11', w: '8', s: '10' }],
      [{ b: '9', w: '7', s: '8' }, { b: '13', w: '10', s: '12' }],
    ]);
  });

  test('semicolon delimiter, and short input pads with fully-blank cells', () => {
    const grid = parsePaste('15/12;11/8', 2);
    expect(grid).toEqual([
      [{ b: '15', w: '12', s: '14' }, { b: '11', w: '8', s: '10' }],
      [{ b: '', w: '', s: '' }, { b: '', w: '', s: '' }],
    ]);
  });

  test('parses a full 5x5 best/worst grid with backfilled singles', () => {
    const row = '15/12\t11/8\t9/7\t13/10\t10/10';
    const grid = parsePaste(Array.from({ length: 5 }, () => row).join('\n'), 5);
    expect(grid).toHaveLength(5);
    expect(grid.every((r) => r.length === 5)).toBe(true);
    expect(grid[4][0]).toEqual({ b: '15', w: '12', s: '14' });
    expect(grid[0][4]).toEqual({ b: '10', w: '10', s: '10' });
  });
});
