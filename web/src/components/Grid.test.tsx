// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import type { Disposition } from '../model/dispositions';
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
  opts: {
    readOnly?: boolean;
    simpleMode?: boolean;
    cellErrors?: (string | null)[][];
    onCellChange?: (i: number, j: number, cell: EditorCell) => void;
    onMyDisposition?: (i: number, d: Disposition) => void;
    onEnemyDisposition?: (j: number, d: Disposition) => void;
  } = {},
) {
  render(
    <Grid
      matrix={m}
      simpleMode={opts.simpleMode ?? false}
      cellErrors={opts.cellErrors ?? noErrors(m.n)}
      readOnly={opts.readOnly}
      onCellChange={opts.onCellChange ?? vi.fn()}
      onMyName={vi.fn()}
      onEnemyName={vi.fn()}
      onMyDisposition={opts.onMyDisposition ?? vi.fn()}
      onEnemyDisposition={opts.onEnemyDisposition ?? vi.fn()}
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
  test('by-map mode shows the map average rounded to a whole score, matching its palette step', () => {
    const m = matrix();
    m.cells[0][0] = { maps: ['12', '9', ''], s: '10' }; // 10.5 -> 11 (half up)
    renderGrid(m);
    const avg = screen.getByLabelText('P1 vs E1 average');
    expect(avg).toHaveTextContent(/^11$/);
    expect(avg.closest('.tile')).toHaveClass('pt-11');
    expect(screen.getByLabelText('P1 vs E1 map A')).toHaveValue('12');
    expect(screen.getByLabelText('P1 vs E1 map C')).toHaveValue('');
  });

  test('a fractional average rounds to the nearest whole score', () => {
    const m = matrix();
    m.cells[0][1] = { maps: ['15', '9', '13'], s: '10' }; // 12.33 -> 12
    m.cells[0][2] = { maps: ['15', '9', '11'], s: '10' }; // 11.67 -> 12
    renderGrid(m);
    expect(screen.getByLabelText('P1 vs E2 average')).toHaveTextContent(/^12$/);
    expect(screen.getByLabelText('P1 vs E3 average')).toHaveTextContent(/^12$/);
  });

  test('a whole-number average shows as is', () => {
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

  test('an invalid cell is outlined with its error as a tooltip, but a blank one is not flagged', () => {
    const m = matrix();
    m.cells[0][0] = { maps: ['25', '', ''], s: '10' };
    m.cells[0][1] = { maps: ['', '', ''], s: '' };
    const errors = noErrors(m.n) as (string | null)[][];
    errors[0][0] = 'Map A: out of range';
    errors[0][1] = 'Enter at least one map rating.';
    renderGrid(m, { cellErrors: errors });
    const bad = screen.getByLabelText('P1 vs E1 map A').closest('td');
    expect(bad).toHaveClass('invalid');
    expect(bad).toHaveAttribute('title', 'Map A: out of range');
    const blank = screen.getByLabelText('P1 vs E2 map A').closest('td');
    expect(blank).not.toHaveClass('invalid');
    expect(blank).not.toHaveAttribute('title');
    expect(screen.getByLabelText('P1 vs E1 map A')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('P1 vs E2 map A')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText('P1 vs E3 map A')).not.toHaveAttribute('aria-invalid');
  });
});

describe('Grid player headers', () => {
  test('the faction shows as a text label over the select (full name, or the positional default)', () => {
    renderGrid(matrix({ enemyNames: ['Chaos Space Marines', '', ''] }));
    expect(screen.getByText('Chaos Space Marines', { selector: '.faction-label' })).toBeInTheDocument();
    expect(screen.getByText('Opponent 2', { selector: '.faction-label' })).toBeInTheDocument();
  });

  test('each player has a disposition select: unset "disposition" plus the five dispositions', () => {
    renderGrid(matrix());
    const s = sel('Your player 1 disposition');
    expect(s.value).toBe('');
    expect(s.options[0].textContent).toBe('disposition');
    expect([...s.options].map((o) => o.value)).toEqual(['', 'purge', 'hold', 'disrupt', 'priority', 'recon']);
    expect(s).toHaveClass('disp-unset');
    expect(sel('Opponent player 3 disposition')).toBeInTheDocument();
  });

  test('a stored disposition shows selected, styled as its pill colour', () => {
    renderGrid(matrix({ myDispositions: ['', 'hold', ''] }));
    const s = sel('Your player 2 disposition');
    expect(s.value).toBe('hold');
    expect(s).toHaveClass('disp-hold');
  });

  test('picking a disposition reports it', async () => {
    const user = userEvent.setup();
    const onMyDisposition = vi.fn();
    renderGrid(matrix(), { onMyDisposition });
    await user.selectOptions(sel('Your player 3 disposition'), 'recon');
    expect(onMyDisposition).toHaveBeenCalledWith(2, 'recon');
  });

  test('picking an opponent disposition reports it', async () => {
    const user = userEvent.setup();
    const onEnemyDisposition = vi.fn();
    renderGrid(matrix(), { onEnemyDisposition });
    await user.selectOptions(sel('Opponent player 2 disposition'), 'priority');
    expect(onEnemyDisposition).toHaveBeenCalledWith(1, 'priority');
  });

  test('readOnly locks the disposition selects too', () => {
    renderGrid(matrix(), { readOnly: true });
    expect(sel('Your player 1 disposition')).toBeDisabled();
    expect(sel('Opponent player 1 disposition')).toBeDisabled();
  });
});

describe('Grid averages', () => {
  test('the footer AVG header does not pick up the global .row utility class', () => {
    renderGrid(matrix());
    const foot = screen.getByText('avg', { selector: 'tfoot th' });
    expect(foot).toHaveClass('avg-foot');
    expect(foot).not.toHaveClass('row');
  });

  test('AVG column and row average the shown values, one decimal, skipping blanks', () => {
    const m = matrix(); // every cell 10/10 -> 10
    m.cells[0][0] = { maps: ['12', '10', ''], s: '10' }; // 11
    m.cells[0][1] = { maps: ['', '', ''], s: '' }; // blank, skipped
    m.cells[0][2] = { maps: ['15', '', ''], s: '15' }; // 15
    renderGrid(m);
    expect(screen.getByLabelText('P1 row average')).toHaveTextContent('13.0'); // (11 + 15) / 2
    expect(screen.getByLabelText('P2 row average')).toHaveTextContent('10.0');
    expect(screen.getByLabelText('E1 column average')).toHaveTextContent('10.3'); // (11 + 10 + 10) / 3
  });

  test('a line with nothing filled shows a dash', () => {
    const m = matrix();
    m.cells[1] = m.cells[1].map(() => ({ maps: ['', '', ''] as [string, string, string], s: '' }));
    renderGrid(m);
    expect(screen.getByLabelText('P2 row average')).toHaveTextContent('–');
  });

  test('single mode averages the single ratings', () => {
    const m = matrix();
    m.cells[0][0] = { maps: ['10', '10', ''], s: '13' };
    renderGrid(m, { simpleMode: true });
    expect(screen.getByLabelText('P1 row average')).toHaveTextContent('11.0'); // (13 + 10 + 10) / 3
  });

  test('a faction fielded by both teams keeps distinct row and column labels', () => {
    renderGrid(matrix({ myNames: ['Orks', '', ''], enemyNames: ['Orks', '', ''] }));
    expect(screen.getAllByLabelText('Orks row average')).toHaveLength(1);
    expect(screen.getAllByLabelText('Orks column average')).toHaveLength(1);
    expect(screen.getByLabelText('Orks row average')).toBeInTheDocument();
    expect(screen.getByLabelText('Orks column average')).toBeInTheDocument();
  });

  test('a column with nothing filled shows a dash', () => {
    const m = matrix();
    m.cells = m.cells.map((row) => row.map((cell, j) => (j === 2 ? { maps: ['', '', ''] as [string, string, string], s: '' } : cell)));
    renderGrid(m);
    expect(screen.getByLabelText('E3 column average')).toHaveTextContent('–');
  });
});
