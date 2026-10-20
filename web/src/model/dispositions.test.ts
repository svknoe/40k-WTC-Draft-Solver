import { describe, expect, test } from 'vitest';
import { DISPOSITIONS, DISPOSITION_LABELS, toDisposition } from './dispositions';

describe('dispositions', () => {
  test('lists the five dispositions with uppercase labels', () => {
    expect(DISPOSITIONS).toEqual(['purge', 'hold', 'disrupt', 'priority', 'recon']);
    expect(DISPOSITION_LABELS.priority).toBe('PRIORITY');
  });

  test('toDisposition passes known values through and blanks anything else', () => {
    expect(toDisposition('hold')).toBe('hold');
    expect(toDisposition('')).toBe('');
    expect(toDisposition('HOLD')).toBe('');
    expect(toDisposition('bogus')).toBe('');
    expect(toDisposition(undefined)).toBe('');
    expect(toDisposition(3)).toBe('');
  });
});
