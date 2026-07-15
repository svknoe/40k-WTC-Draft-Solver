import { describe, expect, test } from 'vitest';
import { formatCell, formatMatchupScore, formatTeamScore, parseRating, scoreBand, teamResult, teamTotal, toInputString, toScore } from './scale';

describe('parseRating', () => {
  test('0-20 numbers convert as score - 10', () => {
    expect(parseRating('10')).toBe(0); // an even 10-10 game
    expect(parseRating('15')).toBe(5);
    expect(parseRating('20')).toBe(10);
    expect(parseRating('0')).toBe(-10); // score 0 = a 20-0 loss
    expect(parseRating('0.0')).toBe(-10); // same, with an explicit decimal
    expect(parseRating('12.5')).toBe(2.5);
  });

  test('trims surrounding whitespace', () => {
    expect(parseRating('  12 ')).toBe(2);
    expect(parseRating(' 0 ')).toBe(-10); // a trimmed 0 is still the score 0
  });

  test('rejects empty, non-numeric, and out-of-range values', () => {
    expect(() => parseRating('')).toThrow(RangeError);
    expect(() => parseRating('   ')).toThrow(RangeError);
    expect(() => parseRating('x')).toThrow(RangeError);
    expect(() => parseRating('21')).toThrow(RangeError);
    expect(() => parseRating('-1')).toThrow(RangeError);
  });

  test('rejects the retired legacy relative tokens', () => {
    for (const token of ['++', '+', '-', '--']) {
      expect(() => parseRating(token)).toThrow(RangeError);
    }
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

  test('serializes score 0 as "0" and the even game as "10"', () => {
    expect(toInputString(-10)).toBe('0'); // internal -10 = score 0 (a 20-0 loss)
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

describe('teamTotal / formatTeamScore', () => {
  test('teamTotal is the unrounded my-total at the 10n baseline', () => {
    expect(teamTotal(6.1, 8)).toBeCloseTo(86.1, 6);
    expect(teamTotal(0, 8)).toBe(80);
    expect(teamTotal(5, 4)).toBe(45);
    // matches teamResult.my once rounded
    expect(Math.round(teamTotal(6.19, 8))).toBe(teamResult(6.19, 8).my);
  });

  test('formatTeamScore always shows one decimal', () => {
    expect(formatTeamScore(86.1)).toBe('86.1');
    expect(formatTeamScore(86)).toBe('86.0');
    expect(formatTeamScore(45)).toBe('45.0');
    expect(formatTeamScore(44.94)).toBe('44.9'); // rounds to one decimal
  });
});

describe('formatMatchupScore', () => {
  test('a map-determined (integer) game shows as a whole number', () => {
    expect(formatMatchupScore(10)).toBe('10');
    expect(formatMatchupScore(7)).toBe('7');
    expect(formatMatchupScore(0)).toBe('0');
    expect(formatMatchupScore(20)).toBe('20');
  });

  test('a neutral 50/50 half-step keeps its one decimal', () => {
    expect(formatMatchupScore(12.5)).toBe('12.5');
    expect(formatMatchupScore(7.5)).toBe('7.5');
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
