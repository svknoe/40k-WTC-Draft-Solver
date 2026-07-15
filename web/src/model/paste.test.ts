import { describe, expect, test } from 'vitest';
import { parsePaste } from './paste';

describe('parsePaste', () => {
  test('best/worst cells ("15/12"), tab-separated', () => {
    const grid = parsePaste('15/12\t11/8\n9/7\t13/10', 2);
    expect(grid).toEqual([
      [{ b: '15', w: '12' }, { b: '11', w: '8' }],
      [{ b: '9', w: '7' }, { b: '13', w: '10' }],
    ]);
  });

  test('single numbers set best = worst, comma-separated', () => {
    const grid = parsePaste('13,14\n9,10', 2);
    expect(grid).toEqual([
      [{ b: '13', w: '13' }, { b: '14', w: '14' }],
      [{ b: '9', w: '9' }, { b: '10', w: '10' }],
    ]);
  });

  test('2n plain numbers per row are read as best/worst alternating', () => {
    const grid = parsePaste('15,12,11,8\n9,7,13,10', 2);
    expect(grid).toEqual([
      [{ b: '15', w: '12' }, { b: '11', w: '8' }],
      [{ b: '9', w: '7' }, { b: '13', w: '10' }],
    ]);
  });

  test('semicolon delimiter, and short input pads with blanks', () => {
    const grid = parsePaste('15/12;11/8', 2);
    expect(grid).toEqual([
      [{ b: '15', w: '12' }, { b: '11', w: '8' }],
      [{ b: '', w: '' }, { b: '', w: '' }],
    ]);
  });

  test('parses a full 5x5 best/worst grid', () => {
    const row = '15/12\t11/8\t9/7\t13/10\t10/10';
    const grid = parsePaste(Array.from({ length: 5 }, () => row).join('\n'), 5);
    expect(grid).toHaveLength(5);
    expect(grid.every((r) => r.length === 5)).toBe(true);
    expect(grid[4][0]).toEqual({ b: '15', w: '12' });
    expect(grid[0][4]).toEqual({ b: '10', w: '10' });
  });
});
