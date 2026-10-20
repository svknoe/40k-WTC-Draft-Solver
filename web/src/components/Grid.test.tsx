// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import type { EditorCell, EditorMatrix } from '../model/matrix';
import { Grid } from './Grid';

function matrix(overrides: Partial<EditorMatrix> = {}): EditorMatrix {
  const n = 3;
  return {
    n,
    myTeam: '',
    enemyTeam: '',
    myNames: ['', '', ''],
    enemyNames: ['', '', ''],
    myDispositions: ['', '', ''],
    enemyDispositions: ['', '', ''],
    cells: Array.from({ length: n }, () =>
      Array.from({ length: n }, () => ({ maps: ['10', '10', ''] as [string, string, string], s: '10' }))),
    ...overrides,
  };
}

const noErrors = (n: number) => Array.from({ length: n }, () => Array.from({ length: n }, () => null));

function renderGrid(
  m: EditorMatrix,
  opts: { readOnly?: boolean; simpleMode?: boolean; onCellChange?: (i: number, j: number, cell: EditorCell) => void } = {},
) {
  render(
    <Grid
      matrix={m}
      simpleMode={opts.simpleMode ?? false}
      cellErrors={noErrors(m.n)}
      readOnly={opts.readOnly}
      onCellChange={opts.onCellChange ?? vi.fn()}
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

describe('Grid tiles', () => {
  test('by-map mode shows the map average, coloured by its rounded palette step', () => {
    const m = matrix();
    m.cells[0][0] = { maps: ['12', '9', ''], s: '10' };
    renderGrid(m);
    const avg = screen.getByLabelText('P1 vs E1 average');
    expect(avg).toHaveTextContent('10.5');
    expect(avg.closest('.tile')).toHaveClass('pt-11');
    expect(screen.getByLabelText('P1 vs E1 map A')).toHaveValue('12');
    expect(screen.getByLabelText('P1 vs E1 map C')).toHaveValue('');
  });

  test('a whole-number average shows without a decimal', () => {
    renderGrid(matrix()); // 10 / 10 / ''
    expect(screen.getByLabelText('P1 vs E2 average')).toHaveTextContent(/^10$/);
  });

  test('a blank cell draws a neutral tile with a dash', () => {
    const m = matrix();
    m.cells[0][1] = { maps: ['', '', ''], s: '' };
    renderGrid(m);
    const avg = screen.getByLabelText('P1 vs E2 average');
    expect(avg).toHaveTextContent('–');
    expect(avg.closest('.tile')).toHaveClass('empty');
    expect(avg.closest('.tile')?.className).not.toMatch(/pt-/);
  });

  test('typing in a map input reports the updated map triple', async () => {
    const user = userEvent.setup();
    const onCellChange = vi.fn();
    renderGrid(matrix(), { onCellChange });
    await user.type(screen.getByLabelText('P1 vs E1 map C'), '7');
    expect(onCellChange).toHaveBeenLastCalledWith(0, 0, { maps: ['10', '10', '7'], s: '10' });
  });

  test('single mode: the centre number is the input and there is no map strip', () => {
    renderGrid(matrix(), { simpleMode: true });
    const input = screen.getByLabelText('P1 vs E1');
    expect(input).toHaveValue('10');
    expect(input.closest('.tile')).toHaveClass('pt-10');
    expect(screen.queryByLabelText('P1 vs E1 map A')).not.toBeInTheDocument();
  });

  test('readOnly makes every tile input read-only', () => {
    renderGrid(matrix(), { readOnly: true });
    expect(screen.getByLabelText('P1 vs E1 map A')).toHaveAttribute('readonly');
  });
});
