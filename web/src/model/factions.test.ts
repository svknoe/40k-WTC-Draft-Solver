import { describe, expect, test } from 'vitest';
import { FACTIONS, FACTION_SET } from './factions';

describe('FACTIONS', () => {
  test('lists 28 distinct factions', () => {
    expect(FACTIONS).toHaveLength(28);
    expect(new Set(FACTIONS).size).toBe(28);
  });

  test('is sorted alphabetically', () => {
    const sorted = [...FACTIONS].sort((a, b) => a.localeCompare(b));
    expect([...FACTIONS]).toEqual(sorted);
  });

  test('FACTION_SET mirrors FACTIONS for membership tests', () => {
    expect(FACTION_SET.size).toBe(FACTIONS.length);
    for (const f of FACTIONS) expect(FACTION_SET.has(f)).toBe(true);
    expect(FACTION_SET.has('Player 1')).toBe(false);
    expect(FACTION_SET.has('')).toBe(false);
  });
});
