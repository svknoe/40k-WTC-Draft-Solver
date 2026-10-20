// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { blank } from '../model/matrix';
import type { EditorMatrix } from '../model/matrix';
import type { Settings } from '../model/storage';
import { MatrixEditor } from './MatrixEditor';

function valid4(): EditorMatrix {
  return {
    n: 4,
    myTeam: 'Norway',
    enemyTeam: 'Scotland',
    myNames: ['A', 'B', 'C', 'D'],
    enemyNames: ['W', 'X', 'Y', 'Z'],
    myDispositions: ['', '', '', ''],
    enemyDispositions: ['', '', '', ''],
    cells: Array.from({ length: 4 }, () =>
      Array.from({ length: 4 }, () => ({ maps: ['12', '9', ''] as [string, string, string], s: '10' }))),
  };
}

function Harness({ initial }: { initial: EditorMatrix }) {
  const [matrix, setMatrix] = useState(initial);
  const [settings, setSettings] = useState<Settings>({ cb: false, simpleMode: false });
  return (
    <MatrixEditor
      matrix={matrix}
      settings={settings}
      saves={{}}
      onMatrixChange={setMatrix}
      onSettingsChange={setSettings}
      onSaveAs={() => {}}
      onLoadSave={() => {}}
      onDeleteSave={() => {}}
      onSolve={() => {}}
    />
  );
}

describe('MatrixEditor', () => {
  test('renders the matchup and grid for a valid matrix, Solve enabled', () => {
    render(<Harness initial={valid4()} />);
    expect(screen.getByDisplayValue('Norway')).toBeInTheDocument();
    expect(screen.getByLabelText('A vs W map A')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /solve/i })).toBeEnabled();
  });

  test('a blank matrix disables Solve on empty cells, with no name error', () => {
    render(<Harness initial={blank(8)} />);
    expect(screen.getByRole('button', { name: /solve/i })).toBeDisabled();
    // Factions are optional now (the Player N / Opponent K dropdown default), so
    // a blank matrix reports no name error — only its cells are incomplete.
    expect(screen.queryByText(/needs a name/i)).not.toBeInTheDocument();
  });

  test('an out-of-range map flags the cell and disables Solve', async () => {
    const user = userEvent.setup();
    render(<Harness initial={valid4()} />);
    const mapC = screen.getByLabelText('A vs W map C');
    await user.type(mapC, '25');
    expect(screen.getByRole('button', { name: /solve/i })).toBeDisabled();
  });

  test('locked shows the draft warning, freezes the grid, and discards on demand', async () => {
    const user = userEvent.setup();
    const onDiscardDraft = vi.fn();
    render(
      <MatrixEditor
        matrix={valid4()}
        settings={{ cb: false, simpleMode: false }}
        saves={{ Scotland: valid4() }}
        onMatrixChange={() => {}}
        onSettingsChange={() => {}}
        onSaveAs={() => {}}
        onLoadSave={() => {}}
        onDeleteSave={() => {}}
        onSolve={() => {}}
        locked
        onDiscardDraft={onDiscardDraft}
      />,
    );

    // Warning banner explaining why editing is paused.
    expect(screen.getByText(/practice draft is in progress/i)).toBeInTheDocument();
    // The grid is frozen and Solve is disabled while a draft depends on it.
    expect(screen.getByLabelText('A vs W map A')).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: /solve/i })).toBeDisabled();
    // Saved-opponent load AND delete are frozen too — the whole editor is paused.
    expect(screen.getByRole('button', { name: 'Scotland' })).toBeDisabled();
    expect(screen.getByTitle('Delete Scotland')).toBeDisabled();
    // Clear/Random would rewrite the matrix under the draft — frozen as well.
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Random' })).toBeDisabled();

    // "Discard draft to edit" discards immediately — no confirmation dialog.
    await user.click(screen.getByRole('button', { name: /discard draft to edit/i }));
    expect(onDiscardDraft).toHaveBeenCalledTimes(1);
  });

  test('opponent name slots default to "Opponent k", not "Enemy k"', () => {
    render(<Harness initial={blank(4)} />);
    // The unset dropdown default shows as the selected option's text.
    expect(screen.getByDisplayValue('Opponent 3')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Enemy 3')).not.toBeInTheDocument();
  });

  test('a disposition picked in the grid sticks (wired to the matrix)', async () => {
    const user = userEvent.setup();
    render(<Harness initial={valid4()} />);
    await user.selectOptions(screen.getByLabelText('Opponent player 2 disposition'), 'purge');
    expect(screen.getByLabelText('Opponent player 2 disposition')).toHaveValue('purge');
  });

  test('the sample loader is gone', () => {
    render(<Harness initial={valid4()} />);
    expect(screen.queryByLabelText(/Load a sample opponent/i)).not.toBeInTheDocument();
  });

  test('Clear resets names and sets every matchup to an even 10', async () => {
    const user = userEvent.setup();
    render(<Harness initial={valid4()} />);
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    // Names reset to '' — the dropdowns show the positional default option.
    expect(screen.getByDisplayValue('Player 1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Opponent 4')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Norway')).not.toBeInTheDocument();
    // Unset names fall back to the terse P/E cell aria-label.
    expect(screen.getByLabelText('P1 vs E1 map A')).toHaveValue('10');
    expect(screen.getByLabelText('P1 vs E1 map B')).toHaveValue('');
    // Still solvable straight away.
    expect(screen.getByRole('button', { name: /solve/i })).toBeEnabled();
  });

  test('Random fills all three maps of every cell with integers 0-20, keeping names', async () => {
    const user = userEvent.setup();
    render(<Harness initial={valid4()} />);
    await user.click(screen.getByRole('button', { name: 'Random' }));
    expect(screen.getByDisplayValue('Norway')).toBeInTheDocument();
    for (const my of ['A', 'B', 'C', 'D']) {
      for (const enemy of ['W', 'X', 'Y', 'Z']) {
        for (const letter of ['A', 'B', 'C']) {
          const raw = (screen.getByLabelText(`${my} vs ${enemy} map ${letter}`) as HTMLInputElement).value;
          expect(raw).not.toBe('');
          expect(Number.isInteger(Number(raw))).toBe(true);
          expect(Number(raw)).toBeGreaterThanOrEqual(0);
          expect(Number(raw)).toBeLessThanOrEqual(20);
        }
      }
    }
    expect(screen.getByRole('button', { name: /solve/i })).toBeEnabled();
  });

  test('Random writes the maps AND the single view in one click, regardless of mode', async () => {
    const user = userEvent.setup();
    render(<Harness initial={valid4()} />); // starts in by-map mode
    await user.click(screen.getByRole('button', { name: 'Random' }));

    const means: Record<string, number> = {};
    for (const my of ['A', 'B', 'C', 'D']) {
      for (const enemy of ['W', 'X', 'Y', 'Z']) {
        const maps = ['A', 'B', 'C'].map((letter) =>
          Number((screen.getByLabelText(`${my} vs ${enemy} map ${letter}`) as HTMLInputElement).value));
        means[`${my}-${enemy}`] = (maps[0] + maps[1] + maps[2]) / 3;
      }
    }

    await user.click(screen.getByRole('button', { name: 'Single rating' }));
    for (const my of ['A', 'B', 'C', 'D']) {
      for (const enemy of ['W', 'X', 'Y', 'Z']) {
        const single = Number((screen.getByLabelText(`${my} vs ${enemy}`) as HTMLInputElement).value);
        expect(single).toBe(Math.round(means[`${my}-${enemy}`]));
      }
    }
  });

  test('typing a single rating leaves the maps untouched (independent layers)', async () => {
    const user = userEvent.setup();
    render(<Harness initial={valid4()} />); // A vs W maps are 12 / 9 / ''
    await user.click(screen.getByRole('button', { name: 'Single rating' }));
    const single = screen.getByLabelText('A vs W');
    await user.clear(single);
    await user.type(single, '7');
    await user.click(screen.getByRole('button', { name: 'Best / worst map' }));
    expect(screen.getByLabelText('A vs W map A')).toHaveValue('12');
    expect(screen.getByLabelText('A vs W map B')).toHaveValue('9');
  });

  test('typing a map leaves the single rating untouched (independent layers)', async () => {
    const user = userEvent.setup();
    render(<Harness initial={valid4()} />); // A vs W single is 10
    const mapA = screen.getByLabelText('A vs W map A');
    await user.clear(mapA);
    await user.type(mapA, '15');
    await user.click(screen.getByRole('button', { name: 'Single rating' }));
    expect(screen.getByLabelText('A vs W')).toHaveValue('10');
  });

  test('switching to single-rating mode collapses cells to one input', async () => {
    const user = userEvent.setup();
    render(<Harness initial={valid4()} />);
    await user.click(screen.getByRole('button', { name: 'Single rating' }));
    expect(screen.getByLabelText('A vs W')).toBeInTheDocument();
    expect(screen.queryByLabelText('A vs W map A')).not.toBeInTheDocument();
  });
});
