import { describe, expect, test } from 'vitest';
import { DISPOSITIONS } from './dispositions';
import { FACTIONS } from './factions';
import {
  blank, cellValue, cleared, EditorCell, EditorMatrix, filledMaps, fromSaved, mapAverage, mapIndex, meanOf, randomized,
  resize, SavedMatrix, singleFromMaps, toEngineMatrix, toSaved, transpose,
} from './matrix';
import { validateMatrix } from './validation';

const c = (a: string, b: string, cc: string, s: string): EditorCell => ({ maps: [a, b, cc], s });

function sample4(): EditorMatrix {
  return {
    n: 4,
    myTeam: 'Norway',
    enemyTeam: 'Scotland',
    myNames: ['A', 'B', 'C', 'D'],
    enemyNames: ['W', 'X', 'Y', 'Z'],
    myDispositions: ['purge', 'hold', '', 'recon'],
    enemyDispositions: ['', 'disrupt', 'priority', ''],
    neutralMap: 'A',
    cells: [
      [c('15', '9', '12', '12'), c('11', '10', '', '11'), c('10', '8', '', '9'), c('13', '', '', '13')],
      [c('9', '7', '', '8'), c('12', '11', '', '12'), c('14', '10', '12', '12'), c('8', '6', '', '7')],
      [c('10', '10', '10', '10'), c('16', '9', '', '13'), c('11', '', '', '11'), c('9', '5', '', '7')],
      [c('12', '8', '', '10'), c('10', '9', '', '10'), c('13', '7', '', '10'), c('15', '14', '', '15')],
    ],
  };
}

describe('blank', () => {
  test('produces an n×n matrix of empty cells, names and dispositions', () => {
    const m = blank(6);
    expect(m.n).toBe(6);
    expect(m.myNames).toHaveLength(6);
    expect(m.enemyNames).toHaveLength(6);
    expect(m.cells).toHaveLength(6);
    expect(m.cells[0]).toHaveLength(6);
    expect(m.cells[3][4]).toEqual(c('', '', '', ''));
    expect(m.myNames.every((s) => s === '')).toBe(true);
    expect(m.myDispositions).toEqual(['', '', '', '', '', '']);
    expect(m.enemyDispositions).toEqual(['', '', '', '', '', '']);
    expect(m.neutralMap).toBe('A');
  });
});

describe('mapIndex', () => {
  test('maps the letters to storage indices', () => {
    expect([mapIndex('A'), mapIndex('B'), mapIndex('C')]).toEqual([0, 1, 2]);
  });
});

describe('filledMaps / mapAverage / cellValue', () => {
  test('filledMaps parses only the filled maps to the internal scale', () => {
    expect(filledMaps(c('15', '', '9', ''))).toEqual([5, -1]);
    expect(filledMaps(c('', '', '', ''))).toEqual([]);
    expect(() => filledMaps(c('x', '', '', ''))).toThrow(RangeError);
  });

  test('mapAverage is the mean of the filled maps on the 0-20 scale', () => {
    expect(mapAverage(c('15', '9', '12', ''))).toBe(12);
    expect(mapAverage(c('12', '9', '', ''))).toBe(10.5);
    expect(mapAverage(c('', '13', '', ''))).toBe(13);
    expect(mapAverage(c('15', '9', '13', ''))).toBeCloseTo(12.333, 3);
  });

  test('mapAverage is null for a blank cell or an unparseable map', () => {
    expect(mapAverage(c('', '', '', '10'))).toBeNull();
    expect(mapAverage(c('12', 'x', '', ''))).toBeNull();
  });

  test('cellValue reads the active layer', () => {
    const cell = c('15', '9', '', '11');
    expect(cellValue(cell, false)).toBe(12);
    expect(cellValue(cell, true)).toBe(11);
    expect(cellValue(c('15', '9', '', ''), true)).toBeNull();
    expect(cellValue(c('15', '9', '', '25'), true)).toBeNull();
  });
});

describe('toEngineMatrix', () => {
  test('by-map mode sends best = max, worst = min and the neutral map as neutral', () => {
    const e = toEngineMatrix(sample4(), false);
    expect(e.n).toBe(4);
    expect(e.myNames).toEqual(['A', 'B', 'C', 'D']);
    expect(e.enemyNames).toEqual(['W', 'X', 'Y', 'Z']);
    expect(e.cells[0][0]).toEqual({ best: 5, worst: -1, neutral: 5 }); // maps 15/9/12, neutral A
    expect(e.cells[0][3]).toEqual({ best: 3, worst: 3, neutral: 3 }); // one map, 13
    expect(e.cells[2][0]).toEqual({ best: 0, worst: 0, neutral: 0 }); // 10/10/10 -> even
  });

  test('the neutral value follows the chosen neutral map', () => {
    // sample4 leaves some maps blank; fill them so every map can be neutral.
    const full = sample4();
    full.cells = full.cells.map((row) => row.map((cell) => c(cell.maps[0], cell.maps[1] || '10', cell.maps[2] || '10', cell.s)));
    expect(toEngineMatrix({ ...full, neutralMap: 'C' }, false).cells[0][0]).toEqual({ best: 5, worst: -1, neutral: 2 }); // C = 12
    expect(toEngineMatrix({ ...full, neutralMap: 'B' }, false).cells[0][0]).toEqual({ best: 5, worst: -1, neutral: -1 }); // B = 9
  });

  test('defaults to by-map mode when no flag is passed', () => {
    expect(toEngineMatrix(sample4()).cells[0][0]).toEqual({ best: 5, worst: -1, neutral: 5 });
  });

  test('fills unset (empty) names with the positional Player/Opponent label', () => {
    const m = sample4();
    m.myNames = ['Necrons', '', 'Orks', '   '];
    m.enemyNames = ['', '', '', ''];
    const e = toEngineMatrix(m, false);
    expect(e.myNames).toEqual(['Necrons', 'Player 2', 'Orks', 'Player 4']);
    expect(e.enemyNames).toEqual(['Opponent 1', 'Opponent 2', 'Opponent 3', 'Opponent 4']);
  });

  test('simple mode uses the single rating for best, worst and neutral, ignoring the maps', () => {
    const e = toEngineMatrix(sample4(), true);
    expect(e.cells[0][0]).toEqual({ best: 2, worst: 2, neutral: 2 }); // s = 12 -> +2
    expect(e.cells[2][0]).toEqual({ best: 0, worst: 0, neutral: 0 });
  });

  test('simple mode ignores the neutral map: blank map C does not throw and neutral = s', () => {
    const m = { ...sample4(), neutralMap: 'C' as const };
    m.cells = m.cells.map((row) => row.map((cell) => ({ maps: [cell.maps[0], cell.maps[1], ''] as [string, string, string], s: cell.s })));
    const e = toEngineMatrix(m, true);
    expect(e.cells[0][0]).toEqual({ best: 2, worst: 2, neutral: 2 });
  });

  test('by-map mode throws on an unparseable map or a blank neutral map', () => {
    const bad = sample4();
    bad.cells[1][1] = c('x', '5', '', '8');
    expect(() => toEngineMatrix(bad, false)).toThrow(RangeError);
    const empty = sample4();
    empty.cells[1][1] = c('', '', '', '8');
    expect(() => toEngineMatrix(empty, false)).toThrow(RangeError);
    const noNeutral = { ...sample4(), neutralMap: 'C' as const };
    noNeutral.cells[0][3] = c('13', '', '', '13');
    expect(() => toEngineMatrix(noNeutral, false)).toThrow(RangeError);
  });

  test('simple mode throws when the single rating is unparseable', () => {
    const m = sample4();
    m.cells[1][1] = c('12', '9', '', 'x');
    expect(() => toEngineMatrix(m, true)).toThrow(RangeError);
  });
});

describe('transpose (swap which side you captain)', () => {
  test('swaps names, teams and dispositions; each map flips to 20 - x and keeps its letter', () => {
    const t = transpose(sample4());
    expect(t.myNames).toEqual(['W', 'X', 'Y', 'Z']);
    expect(t.enemyNames).toEqual(['A', 'B', 'C', 'D']);
    expect(t.myTeam).toBe('Scotland');
    expect(t.enemyTeam).toBe('Norway');
    expect(t.myDispositions).toEqual(['', 'disrupt', 'priority', '']);
    expect(t.enemyDispositions).toEqual(['purge', 'hold', '', 'recon']);
    expect(t.cells[1][0]).toEqual(c('9', '10', '', '9')); // old [0][1] = 11/10/'' s 11
    expect(t.cells[0][0]).toEqual(c('5', '11', '8', '8')); // old [0][0] = 15/9/12 s 12
  });

  test("the other captain's best/worst are the negated worst/best", () => {
    const before = toEngineMatrix(sample4(), false).cells[0][1]; // best 1, worst 0
    const after = toEngineMatrix(transpose(sample4()), false).cells[1][0];
    // `0 - x` rather than `-x`: toEqual distinguishes -0 from +0, and worst is 0 here.
    expect(after).toEqual({ best: 0 - before.worst, worst: 0 - before.best, neutral: 0 - (before.neutral as number) });
  });

  test('keeps the neutral map (a map keeps its letter)', () => {
    expect(transpose({ ...sample4(), neutralMap: 'B' }).neutralMap).toBe('B');
  });

  test('is an involution on a numeric matrix', () => {
    expect(transpose(transpose(sample4()))).toEqual(sample4());
  });

  test('leniently blanks unparseable/blank fields instead of throwing', () => {
    const m = blank(4);
    m.cells[0][0] = c('', '', '', '7');
    expect(transpose(m).cells[0][0]).toEqual(c('', '', '', '13'));
  });
});

describe('resize', () => {
  test('preserves the overlapping block and pads/truncates the rest', () => {
    const grown = resize(sample4(), 6);
    expect(grown.n).toBe(6);
    expect(grown.myNames.slice(0, 4)).toEqual(['A', 'B', 'C', 'D']);
    expect(grown.cells[0][0]).toEqual(c('15', '9', '12', '12'));
    expect(grown.cells[5][5]).toEqual(c('', '', '', ''));
    expect(resize(sample4(), 4)).toEqual(sample4());
  });

  test('growing leaves the added name and disposition slots unset', () => {
    const grown = resize(sample4(), 6);
    expect(grown.myNames.slice(4)).toEqual(['', '']);
    expect(grown.enemyNames.slice(4)).toEqual(['', '']);
    expect(grown.myDispositions).toEqual(['purge', 'hold', '', 'recon', '', '']);
    expect(grown.enemyDispositions).toEqual(['', 'disrupt', 'priority', '', '', '']);
  });

  test('keeps the neutral map', () => {
    expect(resize({ ...sample4(), neutralMap: 'B' }, 6).neutralMap).toBe('B');
    expect(resize({ ...sample4(), neutralMap: 'B' }, 3).neutralMap).toBe('B');
  });

  test('shrinking truncates dispositions', () => {
    expect(resize(sample4(), 3).myDispositions).toEqual(['purge', 'hold', '']);
  });

  test('copies cells rather than sharing their map arrays', () => {
    const m = sample4();
    const grown = resize(m, 5);
    grown.cells[0][0].maps[0] = '1';
    expect(m.cells[0][0].maps[0]).toBe('15');
  });
});

describe('cleared', () => {
  test('resets names and dispositions, and sets all three maps and the single to an even 10', () => {
    const m = cleared(5);
    expect(m.n).toBe(5);
    expect(m.myTeam).toBe('');
    expect(m.enemyTeam).toBe('');
    expect(m.myNames).toEqual(['', '', '', '', '']);
    expect(m.enemyNames).toEqual(['', '', '', '', '']);
    expect(m.myDispositions).toEqual(['', '', '', '', '']);
    expect(m.enemyDispositions).toEqual(['', '', '', '', '']);
    for (const row of m.cells) {
      expect(row).toHaveLength(5);
      for (const cell of row) expect(cell).toEqual(c('10', '10', '10', '10'));
    }
  });

  test('is valid in both rating modes straight away', () => {
    const m = cleared(4);
    expect(validateMatrix(m, false).ok).toBe(true);
    expect(validateMatrix(m, true).ok).toBe(true);
  });

  test('is valid whichever map is the neutral map', () => {
    for (const neutralMap of ['A', 'B', 'C'] as const) {
      expect(validateMatrix({ ...cleared(4), neutralMap }, false).ok).toBe(true);
    }
  });
});

describe('randomized', () => {
  test('fills all three maps and the single with integers 0-20, keeping team names', () => {
    const m = randomized(sample4(), Math.random);
    expect(m.myTeam).toBe('Norway');
    expect(m.enemyTeam).toBe('Scotland');
    for (const row of m.cells) {
      for (const cell of row) {
        const maps = cell.maps.map(Number);
        for (const raw of [...cell.maps, cell.s]) {
          expect(raw).not.toBe('');
          const v = Number(raw);
          expect(Number.isInteger(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(20);
        }
        expect(Number(cell.s)).toBe(Math.round((maps[0] + maps[1] + maps[2]) / 3));
      }
    }
  });

  test('assigns the three draws to A, B, C in order and averages them into the single', () => {
    // rng cycles 0.1, 0.9, 0.5 -> draws 2, 18, 10; mean 10.
    let i = 0;
    const rng = () => [0.1, 0.9, 0.5][i++ % 3];
    for (const row of randomized(sample4(), rng).cells) {
      for (const cell of row) expect(cell).toEqual(c('2', '18', '10', '10'));
    }
  });

  test('rounds a fractional mean to the nearest whole number', () => {
    let i = 0;
    const up = () => [0.15, 0.2, 0.2][i++ % 3]; // 3, 4, 4 -> 3.67 -> 4
    expect(randomized(sample4(), up).cells[0][0]).toEqual(c('3', '4', '4', '4'));
    let k = 0;
    const down = () => [0.15, 0.15, 0.2][k++ % 3]; // 3, 3, 4 -> 3.33 -> 3
    expect(randomized(sample4(), down).cells[0][0]).toEqual(c('3', '3', '4', '3'));
  });

  test('covers the full 0-20 range at the extremes', () => {
    expect(randomized(sample4(), () => 0).cells[0][0]).toEqual(c('0', '0', '0', '0'));
    expect(randomized(sample4(), () => 0.999999).cells[0][0]).toEqual(c('20', '20', '20', '20'));
  });

  test('always yields a valid matrix in both modes, even with a degenerate rng', () => {
    for (const rng of [Math.random, () => 0, () => 0.999999]) {
      const m = randomized(blank(8), rng);
      expect(validateMatrix(m, false).ok).toBe(true);
      expect(validateMatrix(m, true).ok).toBe(true);
    }
  });

  const SIZES = [3, 4, 5, 6, 7, 8] as const;

  test('gives each team distinct WTC factions (both teams may share one)', () => {
    for (const n of SIZES) {
      const m = randomized(blank(n), Math.random);
      for (const names of [m.myNames, m.enemyNames]) {
        expect(names).toHaveLength(n);
        expect(names.every((f) => (FACTIONS as readonly string[]).includes(f))).toBe(true);
        expect(new Set(names).size).toBe(n);
      }
    }
  });

  test('a team of 5+ fields every disposition at least once and at most twice', () => {
    for (const n of [5, 6, 7, 8] as const) {
      for (let run = 0; run < 20; run++) {
        const m = randomized(blank(n), Math.random);
        for (const dispositions of [m.myDispositions, m.enemyDispositions]) {
          expect(dispositions).toHaveLength(n);
          for (const d of DISPOSITIONS) {
            const count = dispositions.filter((x) => x === d).length;
            expect(count).toBeGreaterThanOrEqual(1);
            expect(count).toBeLessThanOrEqual(2);
          }
        }
      }
    }
  });

  test('a team smaller than 5 gets distinct dispositions, none unset', () => {
    for (const n of [3, 4] as const) {
      const m = randomized(blank(n), Math.random);
      for (const dispositions of [m.myDispositions, m.enemyDispositions]) {
        expect(dispositions).toHaveLength(n);
        expect(dispositions).not.toContain('');
        expect(new Set(dispositions).size).toBe(n);
      }
    }
  });
});

describe('fromSaved sizes 3-8', () => {
  test('accepts 3x3, 5x5 and 7x7', () => {
    expect(fromSaved(toSaved(blank(3))).n).toBe(3);
    expect(fromSaved(toSaved(blank(5))).n).toBe(5);
    expect(fromSaved(toSaved(blank(7))).n).toBe(7);
  });

  test('rejects sizes outside 3-8', () => {
    const two = { ...toSaved(blank(4)), myNames: ['a', 'b'] };
    expect(() => fromSaved(two)).toThrow(/Team size must be 3-8/);
    const nine = { ...toSaved(blank(4)), myNames: Array.from({ length: 9 }, (_, i) => `p${i}`) };
    expect(() => fromSaved(nine)).toThrow(/Team size must be 3-8/);
  });

  test('round-trips a full matrix, dispositions included', () => {
    expect(fromSaved(toSaved(sample4()))).toEqual(sample4());
  });
});

describe('fromSaved dispositions', () => {
  test('unknown disposition values load as unset', () => {
    const saved: SavedMatrix = toSaved(blank(3));
    saved.enemyDispositions = ['purge', 'bogus', 'hold'] as unknown as SavedMatrix['enemyDispositions'];
    expect(fromSaved(saved).enemyDispositions).toEqual(['purge', '', 'hold']);
  });
});

describe('fromSaved formats', () => {
  test('a cell without a maps array is malformed', () => {
    const saved = toSaved(blank(3));
    const legacy = { b: '15', w: '9' } as unknown as EditorCell;
    saved.cells = [[legacy, legacy, legacy], saved.cells[1], saved.cells[2]];
    expect(() => fromSaved(saved)).toThrow(/Malformed/);
  });

  test('a short maps array is padded and a missing single rating stays blank', () => {
    const saved = toSaved(blank(3));
    saved.cells[0][0] = { maps: ['14'] } as unknown as EditorCell;
    expect(fromSaved(saved).cells[0][0]).toEqual(c('14', '', '', ''));
  });

  test('a missing or unknown neutralMap loads as A; C round-trips', () => {
    const saved = toSaved(blank(3));
    delete saved.neutralMap;
    expect(fromSaved(saved).neutralMap).toBe('A');
    expect(fromSaved({ ...saved, neutralMap: 'Z' as unknown as 'A' }).neutralMap).toBe('A');
    expect(fromSaved(toSaved({ ...blank(3), neutralMap: 'C' })).neutralMap).toBe('C');
  });

  test('names are no longer rewritten ("Player 1" stays "Player 1")', () => {
    const saved: SavedMatrix = { ...toSaved(blank(3)), myNames: ['Player 1', 'Necrons', ''] };
    expect(fromSaved(saved).myNames).toEqual(['Player 1', 'Necrons', '']);
  });
});

describe('singleFromMaps', () => {
  test('is the rounded mean of the filled maps', () => {
    expect(singleFromMaps(['15', '9', '13'])).toBe('12');
    expect(singleFromMaps(['15', '10', ''])).toBe('13'); // 12.5 -> 13
  });

  test('is blank when nothing is filled or a map is unparseable', () => {
    expect(singleFromMaps(['', '', ''])).toBe('');
    expect(singleFromMaps(['x', '1', ''])).toBe('');
  });
});

describe('meanOf', () => {
  test('averages the non-null values', () => {
    expect(meanOf([11, null, 15])).toBe(13);
    expect(meanOf([10, 10, 11])).toBeCloseTo(10.333, 3);
  });

  test('is null when there is nothing to average', () => {
    expect(meanOf([])).toBeNull();
    expect(meanOf([null, null])).toBeNull();
  });
});
