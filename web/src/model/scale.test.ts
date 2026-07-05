import { describe, expect, test } from 'vitest';
import { formatCell, parseRating, toInputString, toScore } from './scale';

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
