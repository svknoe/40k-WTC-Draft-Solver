import { describe, expect, test } from 'vitest';
import { parsePaste } from './paste';

const cell = (a: string, b: string, c: string, s: string) => ({ maps: [a, b, c], s });

describe('parsePaste', () => {
  test('map triples ("15/12/9") fill A, B, C in order and backfill the single', () => {
    expect(parsePaste('15/12/9\t11/8/14', 2)[0]).toEqual([
      cell('15', '12', '9', '12'), // mean 12
      cell('11', '8', '14', '11'), // mean 11
    ]);
  });

  test('best/worst pairs ("15/12") fill maps A and B, tab-separated', () => {
    expect(parsePaste('15/12\t11/8\n9/7\t13/10', 2)).toEqual([
      [cell('15', '12', '', '14'), cell('11', '8', '', '10')], // 13.5 -> 14, 9.5 -> 10
      [cell('9', '7', '', '8'), cell('13', '10', '', '12')], // 8, 11.5 -> 12
    ]);
  });

  test('single numbers fill map A and the single, comma-separated', () => {
    expect(parsePaste('13,14\n9,10', 2)).toEqual([
      [cell('13', '', '', '13'), cell('14', '', '', '14')],
      [cell('9', '', '', '9'), cell('10', '', '', '10')],
    ]);
  });

  test('2n plain numbers per row are read as best/worst pairs into maps A and B', () => {
    expect(parsePaste('15,12,11,8\n9,7,13,10', 2)).toEqual([
      [cell('15', '12', '', '14'), cell('11', '8', '', '10')],
      [cell('9', '7', '', '8'), cell('13', '10', '', '12')],
    ]);
  });

  test('semicolon delimiter, and short input pads with fully blank cells', () => {
    expect(parsePaste('15/12;11/8', 2)).toEqual([
      [cell('15', '12', '', '14'), cell('11', '8', '', '10')],
      [cell('', '', '', ''), cell('', '', '', '')],
    ]);
  });

  test('parses a full 5x5 grid', () => {
    const row = '15/12\t11/8\t9/7\t13/10\t10/10';
    const grid = parsePaste(Array.from({ length: 5 }, () => row).join('\n'), 5);
    expect(grid).toHaveLength(5);
    expect(grid.every((r) => r.length === 5)).toBe(true);
    expect(grid[4][0]).toEqual(cell('15', '12', '', '14'));
    expect(grid[0][4]).toEqual(cell('10', '10', '', '10'));
  });
});
