// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { EditorMatrix } from '../model/matrix';
import { Grid } from './Grid';

function matrix(overrides: Partial<EditorMatrix> = {}): EditorMatrix {
  const n = 3;
  return {
    n,
    myTeam: '',
    enemyTeam: '',
    myNames: ['', '', ''],
    enemyNames: ['', '', ''],
    cells: Array.from({ length: n }, () =>
      Array.from({ length: n }, () => ({ b: '10', w: '10', s: '10' }))),
    ...overrides,
  };
}

const noErrors = (n: number) => Array.from({ length: n }, () => Array.from({ length: n }, () => null));

function renderGrid(m: EditorMatrix, opts: { readOnly?: boolean } = {}) {
  render(
    <Grid
      matrix={m}
      simpleMode={false}
      cellErrors={noErrors(m.n)}
      readOnly={opts.readOnly}
      onCellChange={vi.fn()}
      onMyName={vi.fn()}
      onEnemyName={vi.fn()}
    />,
  );
}

const sel = (label: string) => screen.getByLabelText(label) as HTMLSelectElement;
function optionDisabled(select: HTMLSelectElement, value: string): boolean {
  const opt = [...select.options].find((o) => o.value === value);
  if (!opt) throw new Error(`no option with value "${value}"`);
  return opt.disabled;
}

describe('Grid faction dropdowns', () => {
  test('each player is a select: positional default on top, then all 28 factions', () => {
    renderGrid(matrix());
    const s = sel('Your player 1 faction');
    expect(s.tagName).toBe('SELECT');
    expect(s.options[0].value).toBe('');
    expect(s.options[0].textContent).toBe('Player 1');
    expect(s.options).toHaveLength(29); // default + 28 factions
    expect([...s.options].some((o) => o.value === 'Necrons')).toBe(true);
    // Enemy columns get the Opponent K default label.
    expect(sel('Opponent player 2 faction').options[0].textContent).toBe('Opponent 2');
  });

  test('a legacy free-text name renders as its own selected option and round-trips', () => {
    renderGrid(matrix({ myNames: ['Bob', '', ''] }));
    const s = sel('Your player 1 faction');
    expect(s.value).toBe('Bob'); // controlled value preserved (not snapped to default)
    expect(s.options[s.selectedIndex].textContent).toBe('Bob');
    expect([...s.options].filter((o) => o.value === 'Bob')).toHaveLength(1);
  });

  test('readOnly locks every name select (a <select> has no readOnly attribute)', () => {
    renderGrid(matrix({ myNames: ['Necrons', '', ''] }), { readOnly: true });
    expect(sel('Your player 1 faction')).toBeDisabled();
    expect(sel('Opponent player 1 faction')).toBeDisabled();
  });

  test('a taken faction greys out for teammates, but not for its holder or the enemy', () => {
    renderGrid(matrix({ myNames: ['Necrons', '', ''] }));
    expect(optionDisabled(sel('Your player 2 faction'), 'Necrons')).toBe(true); // teammate: greyed
    expect(optionDisabled(sel('Your player 1 faction'), 'Necrons')).toBe(false); // own pick: the f !== value guard
    expect(optionDisabled(sel('Opponent player 1 faction'), 'Necrons')).toBe(false); // cross-team: allowed
  });
});
