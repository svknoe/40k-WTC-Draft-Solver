import { describe, expect, test } from 'vitest';
import { pointClass, pointStep } from './palette';

describe('pointStep', () => {
  test('rounds a 0-20 value to its nearest whole palette step', () => {
    expect(pointStep(12)).toBe(12);
    expect(pointStep(11.33)).toBe(11);
    expect(pointStep(11.67)).toBe(12);
    expect(pointStep(10.5)).toBe(11); // .5 rounds up
  });

  test('clamps out-of-range values to the ends of the scale', () => {
    expect(pointStep(-1)).toBe(0);
    expect(pointStep(21)).toBe(20);
  });
});

describe('pointClass', () => {
  test('names the palette class for a value', () => {
    expect(pointClass(0)).toBe('pt-0');
    expect(pointClass(13.4)).toBe('pt-13');
    expect(pointClass(20)).toBe('pt-20');
  });
});
