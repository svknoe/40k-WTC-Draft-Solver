import { describe, expect, test } from 'vitest';
import { blank, cleared, EditorMatrix, fromSaved, randomized, resize, SavedMatrix, toEngineMatrix, toSaved, transpose } from './matrix';
import { validateMatrix } from './validation';

function sample4(): EditorMatrix {
  return {
    n: 4,
    myTeam: 'Norway',
    enemyTeam: 'Scotland',
    myNames: ['A', 'B', 'C', 'D'],
    enemyNames: ['W', 'X', 'Y', 'Z'],
    cells: [
      [{ b: '15', w: '9', s: '12' }, { b: '11', w: '10', s: '11' }, { b: '10', w: '8', s: '9' }, { b: '13', w: '12', s: '13' }],
      [{ b: '9', w: '7', s: '8' }, { b: '12', w: '11', s: '12' }, { b: '14', w: '10', s: '12' }, { b: '8', w: '6', s: '7' }],
      [{ b: '10', w: '10', s: '10' }, { b: '16', w: '9', s: '13' }, { b: '11', w: '11', s: '11' }, { b: '9', w: '5', s: '7' }],
      [{ b: '12', w: '8', s: '10' }, { b: '10', w: '9', s: '10' }, { b: '13', w: '7', s: '10' }, { b: '15', w: '14', s: '15' }],
    ],
  };
}

describe('blank', () => {
  test('produces an n×n matrix of empty cells (all three slots) and names', () => {
    const m = blank(6);
    expect(m.n).toBe(6);
    expect(m.myNames).toHaveLength(6);
    expect(m.enemyNames).toHaveLength(6);
    expect(m.cells).toHaveLength(6);
    expect(m.cells[0]).toHaveLength(6);
    expect(m.cells[3][4]).toEqual({ b: '', w: '', s: '' });
    expect(m.myNames.every((s) => s === '')).toBe(true);
  });
});

describe('toEngineMatrix', () => {
  test('best/worst mode parses b/w to internal-scale best/worst and carries names/n', () => {
    const e = toEngineMatrix(sample4(), false);
    expect(e.n).toBe(4);
    expect(e.myNames).toEqual(['A', 'B', 'C', 'D']);
    expect(e.enemyNames).toEqual(['W', 'X', 'Y', 'Z']);
    expect(e.cells[0][0]).toEqual({ best: 5, worst: -1 }); // 15/9 -> +5/-1
    expect(e.cells[2][0]).toEqual({ best: 0, worst: 0 }); // 10/10 -> even
  });

  test('defaults to best/worst mode when no flag is passed', () => {
    expect(toEngineMatrix(sample4()).cells[0][0]).toEqual({ best: 5, worst: -1 });
  });

  test('simple mode uses the single rating for both maps, ignoring b/w', () => {
    const e = toEngineMatrix(sample4(), true);
    expect(e.cells[0][0]).toEqual({ best: 2, worst: 2 }); // s = 12 -> +2 on both
    expect(e.cells[2][0]).toEqual({ best: 0, worst: 0 }); // s = 10 -> even
  });

  test('best/worst mode throws when a b/w cell is unparseable', () => {
    const m = sample4();
    m.cells[1][1] = { b: 'x', w: '5', s: '8' };
    expect(() => toEngineMatrix(m, false)).toThrow(RangeError);
  });

  test('simple mode throws when the single rating is unparseable', () => {
    const m = sample4();
    m.cells[1][1] = { b: '12', w: '9', s: 'x' };
    expect(() => toEngineMatrix(m, true)).toThrow(RangeError);
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
    expect(t.cells[1][0]).toEqual({ b: '10', w: '9', s: '9' }); // old s 11 -> 20-11 = 9
    // old[0][0] = 15/9 -> new[0][0] best = 20-9 = 11, worst = 20-15 = 5.
    expect(t.cells[0][0]).toEqual({ b: '11', w: '5', s: '8' }); // old s 12 -> 20-12 = 8
  });

  test('is an involution on a numeric matrix (single rating included)', () => {
    const m = sample4();
    expect(transpose(transpose(m))).toEqual(m);
  });

  test('leniently blanks an unparseable/blank inactive layer instead of throwing', () => {
    // Single-rating mode may leave b/w blank; Swap is gated only on the active
    // layer, so transpose must tolerate a blank inactive layer.
    const m = blank(4);
    m.cells[0][0] = { b: '', w: '', s: '7' };
    const t = transpose(m);
    expect(t.cells[0][0]).toEqual({ b: '', w: '', s: '13' }); // s 7 -> 20-7 = 13
  });
});

describe('resize', () => {
  test('preserves the overlapping block and pads/truncates the rest', () => {
    const grown = resize(sample4(), 6);
    expect(grown.n).toBe(6);
    expect(grown.myNames.slice(0, 4)).toEqual(['A', 'B', 'C', 'D']);
    expect(grown.cells[0][0]).toEqual({ b: '15', w: '9', s: '12' });
    expect(grown.cells[5][5]).toEqual({ b: '', w: '', s: '' });

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
  test('resets to default names and an even 10 in all three slots of every cell', () => {
    const m = cleared(5);
    expect(m.n).toBe(5);
    expect(m.myTeam).toBe('');
    expect(m.enemyTeam).toBe('');
    expect(m.myNames).toEqual(['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5']);
    expect(m.enemyNames).toEqual(['Opponent 1', 'Opponent 2', 'Opponent 3', 'Opponent 4', 'Opponent 5']);
    expect(m.cells).toHaveLength(5);
    for (const row of m.cells) {
      expect(row).toHaveLength(5);
      for (const cell of row) expect(cell).toEqual({ b: '10', w: '10', s: '10' });
    }
  });

  test('is valid in both rating modes straight away', () => {
    const m = cleared(4);
    expect(validateMatrix(m, false).ok).toBe(true);
    expect(validateMatrix(m, true).ok).toBe(true);
  });
});

describe('randomized', () => {
  test('rewrites every cell with integers 0-20 in all three slots, best ≥ single ≥ worst, keeping names', () => {
    const m = randomized(sample4(), Math.random);
    expect(m.n).toBe(4);
    expect(m.myTeam).toBe('Norway');
    expect(m.myNames).toEqual(['A', 'B', 'C', 'D']);
    expect(m.enemyNames).toEqual(['W', 'X', 'Y', 'Z']);
    for (const row of m.cells) {
      for (const cell of row) {
        const b = Number(cell.b);
        const w = Number(cell.w);
        const s = Number(cell.s);
        for (const v of [b, w, s]) {
          expect(Number.isInteger(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(20);
        }
        // The single rating is the rounded mean of the two draws, so it lies
        // between the worst and best map.
        expect(b).toBeGreaterThanOrEqual(s);
        expect(s).toBeGreaterThanOrEqual(w);
      }
    }
  });

  test('orders the two draws (larger → best, smaller → worst) and averages them into the single rating', () => {
    // Deterministic rng cycling 0.1, 0.9 → draws 2 and 18; mean 10 is whole so
    // no tie-break draw is consumed and the cycle stays aligned per cell.
    let i = 0;
    const rng = () => [0.1, 0.9][i++ % 2];
    const m = randomized(sample4(), rng);
    for (const row of m.cells) {
      for (const cell of row) expect(cell).toEqual({ b: '18', w: '2', s: '10' });
    }
  });

  test('covers the full 0-20 range at the extremes, writing score 0 as "0" in every slot', () => {
    // A drawn 0 is the community score 0 (a 20-0 blowout) and serialises as the
    // plain "0" — in best, worst AND single.
    expect(randomized(sample4(), () => 0).cells[0][0]).toEqual({ b: '0', w: '0', s: '0' });
    expect(randomized(sample4(), () => 0.999999).cells[0][0]).toEqual({ b: '20', w: '20', s: '20' });
  });

  test('a fractional average rounds the single rating down when the tie-break draw is < 0.5', () => {
    // Draws 3 and 4 (average 3.5), then 0.4 → round down to 3. Best/worst keep
    // the ordered spread; only the single rating is rounded.
    let i = 0;
    const rng = () => [0.15, 0.2, 0.4][i++ % 3];
    const m = randomized(sample4(), rng);
    for (const row of m.cells) {
      for (const cell of row) expect(cell).toEqual({ b: '4', w: '3', s: '3' });
    }
  });

  test('a fractional average rounds the single rating up when the tie-break draw is ≥ 0.5', () => {
    // Draws 3 and 4 (average 3.5), then 0.6 → round up to 4.
    let i = 0;
    const rng = () => [0.15, 0.2, 0.6][i++ % 3];
    const m = randomized(sample4(), rng);
    for (const row of m.cells) {
      for (const cell of row) expect(cell).toEqual({ b: '4', w: '3', s: '4' });
    }
  });

  test('always yields a valid matrix in both modes, including a drawn 0', () => {
    // rng cycles 0, 0.15, 0.4 → draws 0 and 3 (average 1.5), tie-break 0.4 →
    // single 1. Best 3 / worst 0 (a 20-0 loss); both layers stay valid.
    let i = 0;
    const rng = () => [0, 0.15, 0.4][i++ % 3];
    const m = randomized(sample4(), rng);
    expect(m.cells[0][0]).toEqual({ b: '3', w: '0', s: '1' });
    expect(validateMatrix(m, false).ok).toBe(true);
    expect(validateMatrix(m, true).ok).toBe(true);
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

describe('fromSaved single-rating backfill', () => {
  // Build a 3×3 saved matrix whose top row carries the cells under test and
  // whose remaining cells are blank. `row0` cells may omit `s` to mimic old
  // data (localStorage / exports predating the single-rating field).
  const savedRaw = (row0: Array<{ b: string; w: string; s?: string }>): SavedMatrix => {
    const cell = { b: '', w: '' };
    return {
      myTeam: '', enemyTeam: '',
      myNames: ['a', 'b', 'c'], enemyNames: ['x', 'y', 'z'],
      cells: [row0, [cell, cell, cell], [cell, cell, cell]],
    } as unknown as SavedMatrix;
  };

  test('keeps an existing single rating rather than deriving one', () => {
    const m = fromSaved(savedRaw([{ b: '15', w: '9', s: '11' }, { b: '', w: '' }, { b: '', w: '' }]));
    expect(m.cells[0][0].s).toBe('11'); // not the derived average of 12
  });

  test('an equal pair copies its value into the single rating (lossless)', () => {
    const m = fromSaved(savedRaw([{ b: '12', w: '12' }, { b: '0', w: '0' }, { b: '', w: '' }]));
    expect(m.cells[0][0].s).toBe('12');
    expect(m.cells[0][1].s).toBe('0'); // a 20-0 pair round-trips as "0"
  });

  test('a spread pair backfills the half-up rounded average', () => {
    const m = fromSaved(savedRaw([{ b: '15', w: '9' }, { b: '15', w: '10' }, { b: '', w: '' }]));
    expect(m.cells[0][0].s).toBe('12'); // (15 + 9) / 2 = 12
    expect(m.cells[0][1].s).toBe('13'); // (15 + 10) / 2 = 12.5 -> 13 (half up)
  });

  test('an unparseable pair backfills a blank single rating', () => {
    const m = fromSaved(savedRaw([{ b: 'x', w: '5' }, { b: '', w: '' }, { b: '', w: '' }]));
    expect(m.cells[0][0].s).toBe('');
  });
});
