import { describe, expect, test } from 'vitest';
import { parsePaste } from './paste';

const cell = (a: string, b: string, c: string, s: string) => ({ maps: [a, b, c], s });
const blankCell = cell('', '', '', '');

describe('parsePaste', () => {
  test('a triple ("15/12/9") fills A, B, C in order and the single takes the rounded mean', () => {
    expect(parsePaste('15/12/9\t11/8/14', 2)[0]).toEqual([
      cell('15', '12', '9', '12'), // mean 12
      cell('11', '8', '14', '11'), // mean 11
    ]);
  });

  test('a single number fills all three maps and the single rating', () => {
    expect(parsePaste('13,14\n9,10', 2)).toEqual([
      [cell('13', '13', '13', '13'), cell('14', '14', '14', '14')],
      [cell('9', '9', '9', '9'), cell('10', '10', '10', '10')],
    ]);
  });

  test('a two-value token ("15/12") is a blank cell', () => {
    expect(parsePaste('15/12\t11/8/14', 2)[0]).toEqual([blankCell, cell('11', '8', '14', '11')]);
  });

  test('a four-value token is a blank cell', () => {
    expect(parsePaste('1/2/3/4\t5/6/7', 2)[0]).toEqual([blankCell, cell('5', '6', '7', '6')]);
  });

  test('tab, comma and semicolon all delimit cells', () => {
    const expected = [cell('15', '12', '9', '12'), cell('11', '8', '14', '11')];
    expect(parsePaste('15/12/9\t11/8/14', 2)[0]).toEqual(expected);
    expect(parsePaste('15/12/9,11/8/14', 2)[0]).toEqual(expected);
    expect(parsePaste('15/12/9;11/8/14', 2)[0]).toEqual(expected);
  });

  test('short input pads with fully blank cells', () => {
    expect(parsePaste('15/12/9', 2)).toEqual([
      [cell('15', '12', '9', '12'), blankCell],
      [blankCell, blankCell],
    ]);
  });

  test('parses a full 5x5 grid', () => {
    const row = '15/12/9\t11/8/14\t9/7/8\t13/10/10\t10/10/10';
    const grid = parsePaste(Array.from({ length: 5 }, () => row).join('\n'), 5);
    expect(grid).toHaveLength(5);
    expect(grid.every((r) => r.length === 5)).toBe(true);
    expect(grid[4][0]).toEqual(cell('15', '12', '9', '12'));
    expect(grid[0][4]).toEqual(cell('10', '10', '10', '10'));
  });
});
