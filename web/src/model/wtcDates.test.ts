import { describe, expect, test } from 'vitest';
import { activeWtcEvent } from './wtcDates';

const events = [{ name: 'Test WTC', start: '2026-08-11', end: '2026-08-16' }];

describe('activeWtcEvent', () => {
  test('locks within the window, inclusive of both endpoints (local date)', () => {
    expect(activeWtcEvent(new Date(2026, 7, 11), events)?.name).toBe('Test WTC'); // Aug 11
    expect(activeWtcEvent(new Date(2026, 7, 13), events)?.name).toBe('Test WTC');
    expect(activeWtcEvent(new Date(2026, 7, 16, 23, 59), events)?.name).toBe('Test WTC'); // Aug 16 late
  });

  test('is unlocked before and after the window', () => {
    expect(activeWtcEvent(new Date(2026, 7, 10), events)).toBeNull(); // Aug 10
    expect(activeWtcEvent(new Date(2026, 7, 17), events)).toBeNull(); // Aug 17
    expect(activeWtcEvent(new Date(2026, 6, 5), events)).toBeNull(); // Jul 5
  });

  test('the bundled schedule includes the 2026 Mechelen event', () => {
    expect(activeWtcEvent(new Date(2026, 7, 13))?.name).toMatch(/2026/);
    expect(activeWtcEvent(new Date(2026, 6, 5))).toBeNull();
  });
});
