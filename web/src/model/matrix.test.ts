import { describe, expect, test } from 'vitest';
import { blank, EditorMatrix, fromSaved, resize, toEngineMatrix, toSaved, transpose } from './matrix';

function sample4(): EditorMatrix {
  return {
    n: 4,
    myTeam: 'Norway',
    enemyTeam: 'Scotland',
    myNames: ['A', 'B', 'C', 'D'],
    enemyNames: ['W', 'X', 'Y', 'Z'],
    cells: [
      [{ b: '15', w: '9' }, { b: '11', w: '10' }, { b: '10', w: '8' }, { b: '13', w: '12' }],
      [{ b: '9', w: '7' }, { b: '12', w: '11' }, { b: '14', w: '10' }, { b: '8', w: '6' }],
      [{ b: '10', w: '10' }, { b: '16', w: '9' }, { b: '11', w: '11' }, { b: '9', w: '5' }],
      [{ b: '12', w: '8' }, { b: '10', w: '9' }, { b: '13', w: '7' }, { b: '15', w: '14' }],
    ],
  };
}

describe('blank', () => {
  test('produces an n×n matrix of empty cells and names', () => {
    const m = blank(6);
    expect(m.n).toBe(6);
    expect(m.myNames).toHaveLength(6);
    expect(m.enemyNames).toHaveLength(6);
    expect(m.cells).toHaveLength(6);
    expect(m.cells[0]).toHaveLength(6);
    expect(m.cells[3][4]).toEqual({ b: '', w: '' });
    expect(m.myNames.every((s) => s === '')).toBe(true);
  });
});

describe('toEngineMatrix', () => {
  test('parses cell strings to internal-scale best/worst and carries names/n', () => {
    const e = toEngineMatrix(sample4());
    expect(e.n).toBe(4);
    expect(e.myNames).toEqual(['A', 'B', 'C', 'D']);
    expect(e.enemyNames).toEqual(['W', 'X', 'Y', 'Z']);
    expect(e.cells[0][0]).toEqual({ best: 5, worst: -1 }); // 15/9 -> +5/-1
    expect(e.cells[2][0]).toEqual({ best: 0, worst: 0 }); // 10/10 -> even
  });

  test('throws when a cell is unparseable', () => {
    const m = sample4();
    m.cells[1][1] = { b: 'x', w: '5' };
    expect(() => toEngineMatrix(m)).toThrow(RangeError);
  });
});

describe('transpose (swap which side you captain)', () => {
  test('swaps names/teams and re-expresses each score from the other side', () => {
    const t = transpose(sample4());
    expect(t.myNames).toEqual(['W', 'X', 'Y', 'Z']);
    expect(t.enemyNames).toEqual(['A', 'B', 'C', 'D']);
    expect(t.myTeam).toBe('Scotland');
    expect(t.enemyTeam).toBe('Norway');
    // old[0][1] = 11/10 (best/worst score for A vs X); from X's view the
    // NEW[1][0] best = 20 - old.worst = 10, worst = 20 - old.best = 9.
    expect(t.cells[1][0]).toEqual({ b: '10', w: '9' });
    // old[0][0] = 15/9 -> new[0][0] best = 20-9 = 11, worst = 20-15 = 5.
    expect(t.cells[0][0]).toEqual({ b: '11', w: '5' });
  });

  test('is an involution on a numeric matrix', () => {
    const m = sample4();
    expect(transpose(transpose(m))).toEqual(m);
  });
});

describe('resize', () => {
  test('preserves the overlapping block and pads/truncates the rest', () => {
    const grown = resize(sample4(), 6);
    expect(grown.n).toBe(6);
    expect(grown.myNames.slice(0, 4)).toEqual(['A', 'B', 'C', 'D']);
    expect(grown.myNames[4]).toBe('');
    expect(grown.cells[0][0]).toEqual({ b: '15', w: '9' });
    expect(grown.cells[5][5]).toEqual({ b: '', w: '' });

    const shrunk = resize(sample4(), 4);
    expect(shrunk).toEqual(sample4());
  });
});

describe('fromSaved sizes 3-8', () => {
  test('accepts a 5x5 saved matrix', () => {
    const saved = toSaved(blank(5));
    expect(fromSaved(saved).n).toBe(5);
  });

  test('accepts 3x3 and 7x7', () => {
    expect(fromSaved(toSaved(blank(3))).n).toBe(3);
    expect(fromSaved(toSaved(blank(7))).n).toBe(7);
  });

  test('rejects sizes outside 3-8', () => {
    const two = { ...toSaved(blank(4)), myNames: ['a', 'b'] };
    expect(() => fromSaved(two)).toThrow(/Team size must be 3-8/);
    const nine = { ...toSaved(blank(4)), myNames: Array.from({ length: 9 }, (_, i) => `p${i}`) };
    expect(() => fromSaved(nine)).toThrow(/Team size must be 3-8/);
  });
});
