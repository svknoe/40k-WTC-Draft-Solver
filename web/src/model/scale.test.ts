import { describe, expect, test } from 'vitest';
import { formatCell, parseRating, scoreBand, teamResult, toInputString, toScore } from './scale';

describe('parseRating', () => {
  test('legacy tokens map to internal deviations from an even game', () => {
    expect(parseRating('++')).toBe(8);
    expect(parseRating('+')).toBe(4);
    expect(parseRating('0')).toBe(0); // bare 0 = even token, NOT the score 0
    expect(parseRating('-')).toBe(-4);
    expect(parseRating('--')).toBe(-8);
  });

  test('0-20 numbers convert as score - 10', () => {
    expect(parseRating('10')).toBe(0);
    expect(parseRating('15')).toBe(5);
    expect(parseRating('20')).toBe(10);
    expect(parseRating('0.0')).toBe(-10); // explicit score 0 = a 20-0 loss
    expect(parseRating('12.5')).toBe(2.5);
  });

  test('trims surrounding whitespace', () => {
    expect(parseRating('  12 ')).toBe(2);
    expect(parseRating(' 0 ')).toBe(0); // still the even token after trim
  });

  test('rejects empty, non-numeric, and out-of-range values', () => {
    expect(() => parseRating('')).toThrow(RangeError);
    expect(() => parseRating('   ')).toThrow(RangeError);
    expect(() => parseRating('x')).toThrow(RangeError);
    expect(() => parseRating('21')).toThrow(RangeError);
    expect(() => parseRating('-1')).toThrow(RangeError);
  });
});

describe('toScore / formatCell', () => {
  test('toScore inverts the score->internal shift', () => {
    expect(toScore(5)).toBe(15);
    expect(toScore(-10)).toBe(0);
    expect(toScore(0)).toBe(10);
  });

  test('formatCell renders best / worst on the 0-20 scale', () => {
    expect(formatCell({ best: 5, worst: 2 })).toBe('15 / 12');
    expect(formatCell({ best: 0, worst: -8 })).toBe('10 / 2');
  });
});

describe('toInputString', () => {
  test('is the inverse of parseRating for every internal value', () => {
    for (let internal = -10; internal <= 10; internal += 0.5) {
      expect(parseRating(toInputString(internal))).toBe(internal);
    }
  });

  test('serializes score 0 as "0.0", not the "0" even token', () => {
    expect(toInputString(-10)).toBe('0.0'); // internal -10 = score 0 (a 20-0 loss)
    expect(toInputString(0)).toBe('10'); // internal 0 = the even game, score 10
    expect(toInputString(10)).toBe('20');
  });
});

describe('teamResult', () => {
  test('maps the internal margin to a team score at the 10n-per-side baseline', () => {
    expect(teamResult(5, 8)).toEqual({ my: 85, enemy: 75, favored: 5 });
    expect(teamResult(0, 8)).toEqual({ my: 80, enemy: 80, favored: 0 });
    expect(teamResult(-3, 8)).toEqual({ my: 77, enemy: 83, favored: -3 });
  });

  test('scales the baseline with team size (6 → /120, 4 → /80)', () => {
    expect(teamResult(3, 6)).toEqual({ my: 63, enemy: 57, favored: 3 });
    expect(teamResult(0, 6)).toEqual({ my: 60, enemy: 60, favored: 0 });
    expect(teamResult(0, 4)).toEqual({ my: 40, enemy: 40, favored: 0 });
  });

  test('rounds and keeps the two scores summing to 20n', () => {
    const r = teamResult(6.189614, 8);
    expect(r.my).toBe(86);
    expect(r.enemy).toBe(74);
    expect(r.my + r.enemy).toBe(160);
    expect(r.favored).toBe(6);
  });
});

describe('scoreBand', () => {
  test('buckets 0-20 scores per the editor legend', () => {
    expect(scoreBand(0)).toBe('worst');
    expect(scoreBand(4)).toBe('worst');
    expect(scoreBand(5)).toBe('bad');
    expect(scoreBand(8)).toBe('bad');
    expect(scoreBand(9)).toBe('okay');
    expect(scoreBand(11)).toBe('okay');
    expect(scoreBand(12)).toBe('good');
    expect(scoreBand(15)).toBe('good');
    expect(scoreBand(16)).toBe('best');
    expect(scoreBand(20)).toBe('best');
  });
});
