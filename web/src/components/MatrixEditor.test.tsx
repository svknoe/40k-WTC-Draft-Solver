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
    cells: Array.from({ length: 4 }, () =>
      Array.from({ length: 4 }, () => ({ b: '12', w: '9' }))),
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
    expect(screen.getByLabelText('A vs W best')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /solve/i })).toBeEnabled();
  });

  test('a blank matrix disables Solve and reports missing names', () => {
    render(<Harness initial={blank(8)} />);
    expect(screen.getByRole('button', { name: /solve/i })).toBeDisabled();
    expect(screen.getAllByText(/needs a name/i).length).toBeGreaterThan(0);
  });

  test('making best < worst flags the cell and disables Solve', async () => {
    const user = userEvent.setup();
    render(<Harness initial={valid4()} />);
    const bestInput = screen.getByLabelText('A vs W best');
    await user.clear(bestInput); // best now blank -> invalid
    await user.type(bestInput, '5'); // best 5 < worst 9
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
    expect(screen.getByLabelText('A vs W best')).toHaveAttribute('readonly');
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

  test('opponent name slots watermark as "Opponent k", not "Enemy k"', () => {
    render(<Harness initial={blank(4)} />);
    expect(screen.getByPlaceholderText('Opponent 3')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Enemy 3')).not.toBeInTheDocument();
  });

  test('the sample loader is gone', () => {
    render(<Harness initial={valid4()} />);
    expect(screen.queryByLabelText(/Load a sample opponent/i)).not.toBeInTheDocument();
  });

  test('Clear resets names to defaults and every cell to an even 10/10', async () => {
    const user = userEvent.setup();
    render(<Harness initial={valid4()} />);
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByDisplayValue('Player 1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Opponent 4')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Norway')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Player 1 vs Opponent 1 best')).toHaveValue('10');
    expect(screen.getByLabelText('Player 1 vs Opponent 1 worst')).toHaveValue('10');
    // Still solvable straight away.
    expect(screen.getByRole('button', { name: /solve/i })).toBeEnabled();
  });

  test('Random fills every cell with integers 0-20, best ≥ worst, keeping names', async () => {
    const user = userEvent.setup();
    render(<Harness initial={valid4()} />);
    await user.click(screen.getByRole('button', { name: 'Random' }));
    expect(screen.getByDisplayValue('Norway')).toBeInTheDocument();
    for (const my of ['A', 'B', 'C', 'D']) {
      for (const enemy of ['W', 'X', 'Y', 'Z']) {
        const best = Number((screen.getByLabelText(`${my} vs ${enemy} best`) as HTMLInputElement).value);
        const worst = Number((screen.getByLabelText(`${my} vs ${enemy} worst`) as HTMLInputElement).value);
        expect(Number.isInteger(best)).toBe(true);
        expect(best).toBeGreaterThanOrEqual(worst);
        expect(best).toBeLessThanOrEqual(20);
        expect(worst).toBeGreaterThanOrEqual(0);
      }
    }
    expect(screen.getByRole('button', { name: /solve/i })).toBeEnabled();
  });

  test('Random in single-rating mode stores one averaged value in both map slots', async () => {
    const user = userEvent.setup();
    render(<Harness initial={valid4()} />);
    await user.click(screen.getByRole('button', { name: 'Single rating' }));
    await user.click(screen.getByRole('button', { name: 'Random' }));
    const single = Number((screen.getByLabelText('A vs W') as HTMLInputElement).value);
    expect(Number.isInteger(single)).toBe(true);
    expect(single).toBeGreaterThanOrEqual(0);
    expect(single).toBeLessThanOrEqual(20);
    // Flip to best/worst: the stored pair is the same value twice, not a spread.
    await user.click(screen.getByRole('button', { name: 'Best / worst map' }));
    for (const my of ['A', 'B', 'C', 'D']) {
      for (const enemy of ['W', 'X', 'Y', 'Z']) {
        const best = (screen.getByLabelText(`${my} vs ${enemy} best`) as HTMLInputElement).value;
        const worst = (screen.getByLabelText(`${my} vs ${enemy} worst`) as HTMLInputElement).value;
        expect(best).toBe(worst);
      }
    }
  });

  test('switching to single-rating mode collapses cells to one input', async () => {
    const user = userEvent.setup();
    render(<Harness initial={valid4()} />);
    await user.click(screen.getByRole('button', { name: 'Single rating' }));
    expect(screen.getByLabelText('A vs W')).toBeInTheDocument();
    expect(screen.queryByLabelText('A vs W best')).not.toBeInTheDocument();
  });
});
