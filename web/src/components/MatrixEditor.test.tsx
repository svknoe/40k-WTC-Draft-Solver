// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, test } from 'vitest';
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

  test('switching to single-rating mode collapses cells to one input', async () => {
    const user = userEvent.setup();
    render(<Harness initial={valid4()} />);
    await user.click(screen.getByRole('button', { name: 'Single rating' }));
    expect(screen.getByLabelText('A vs W')).toBeInTheDocument();
    expect(screen.queryByLabelText('A vs W best')).not.toBeInTheDocument();
  });
});
