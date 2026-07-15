import { describe, expect, test } from 'vitest';
import { blank, cleared, EditorMatrix, fromSaved, randomized, resize, toEngineMatrix, toSaved, transpose } from './matrix';

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
    expect(grown.cells[0][0]).toEqual({ b: '15', w: '9' });
    expect(grown.cells[5][5]).toEqual({ b: '', w: '' });

    const shrunk = resize(sample4(), 4);
    expect(shrunk).toEqual(sample4());
  });

  test('growing pre-fills the added name slots with Player/Opponent defaults', () => {
    const grown = resize(sample4(), 6);
    expect(grown.myNames.slice(4)).toEqual(['Player 5', 'Player 6']);
    expect(grown.enemyNames.slice(4)).toEqual(['Opponent 5', 'Opponent 6']);
  });

  test('growing leaves pre-existing blank names blank', () => {
    const grown = resize(blank(4), 5);
    expect(grown.myNames).toEqual(['', '', '', '', 'Player 5']);
    expect(grown.enemyNames).toEqual(['', '', '', '', 'Opponent 5']);
  });
});

describe('cleared', () => {
  test('resets to default names and an even 10/10 in every cell', () => {
    const m = cleared(5);
    expect(m.n).toBe(5);
    expect(m.myTeam).toBe('');
    expect(m.enemyTeam).toBe('');
    expect(m.myNames).toEqual(['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5']);
    expect(m.enemyNames).toEqual(['Opponent 1', 'Opponent 2', 'Opponent 3', 'Opponent 4', 'Opponent 5']);
    expect(m.cells).toHaveLength(5);
    for (const row of m.cells) {
      expect(row).toHaveLength(5);
      for (const cell of row) expect(cell).toEqual({ b: '10', w: '10' });
    }
  });
});

describe('randomized', () => {
  test('rewrites every cell with integers 0-20, best ≥ worst, keeping names', () => {
    const m = randomized(sample4(), Math.random);
    expect(m.n).toBe(4);
    expect(m.myTeam).toBe('Norway');
    expect(m.myNames).toEqual(['A', 'B', 'C', 'D']);
    expect(m.enemyNames).toEqual(['W', 'X', 'Y', 'Z']);
    for (const row of m.cells) {
      for (const cell of row) {
        const b = Number(cell.b);
        const w = Number(cell.w);
        expect(Number.isInteger(b)).toBe(true);
        expect(Number.isInteger(w)).toBe(true);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(20);
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(20);
        expect(b).toBeGreaterThanOrEqual(w);
      }
    }
  });

  test('orders the two draws per cell: larger → best, smaller → worst', () => {
    // Deterministic rng cycling 0.1, 0.9 → draws 2 and 18 in alternating order.
    let i = 0;
    const rng = () => [0.1, 0.9][i++ % 2];
    const m = randomized(sample4(), rng);
    for (const row of m.cells) {
      for (const cell of row) expect(cell).toEqual({ b: '18', w: '2' });
    }
  });

  test('covers the full 0-20 range at the extremes', () => {
    expect(randomized(sample4(), () => 0).cells[0][0]).toEqual({ b: '0', w: '0' });
    expect(randomized(sample4(), () => 0.999999).cells[0][0]).toEqual({ b: '20', w: '20' });
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
