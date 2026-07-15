// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { App } from './App';
import { fixtureMatrix, smoke } from './conformance/fixtures';
import { DraftEngine } from './engine/engine';
import type { Move } from './engine/types';
import type { SolveState } from './worker/useSolve';

/** A done SolveState backed by a real Smoke engine (so node() returns genuine
 * decisions) with a spy reset() — lets an App test drive a live draft without a
 * worker and assert on solver resets. */
function doneSolve(): SolveState {
  const engine = new DraftEngine(fixtureMatrix(smoke), null, smoke.neutralWeight);
  const expected = engine.solve();
  return {
    status: 'done',
    progress: 1,
    phase: null,
    result: { type: 'solved', reqId: 1, expected, root: engine.nodeResult([]) },
    error: null,
    solvedK: null,
    solve: vi.fn(),
    reset: vi.fn(),
    node: (path: Move[]) => Promise.resolve(engine.nodeResult(path)),
  };
}

describe('App', () => {
  test('renders the editor shell with the Local-only pill', () => {
    render(<App />);
    expect(screen.getByText(/Local-only/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Matrix' })).toBeInTheDocument();
  });

  test('keeps the draft trainer mounted when switching tabs (no reset)', async () => {
    localStorage.clear();
    const user = userEvent.setup();
    const { container } = render(<App />);

    // A valid matrix is needed to reach the Trainer; Clear at size 4 gives one.
    await user.selectOptions(screen.getByLabelText('Team size'), '4');
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await user.click(screen.getByRole('button', { name: 'Trainer' }));
    expect(container.querySelector('.trainer')).toBeTruthy();

    // Switching to another tab must NOT unmount the trainer (that would reset
    // any in-progress draft) — it stays in the DOM, just hidden.
    await user.click(screen.getByRole('button', { name: 'Matrix' }));
    expect(container.querySelector('.trainer')).toBeTruthy();
  });

  test('discarding an in-progress draft resets the solver and unlocks the editor', async () => {
    localStorage.clear();
    const user = userEvent.setup();
    const solve = doneSolve();
    render(<App solve={solve} />);

    // Build a valid matrix and start a draft so the Matrix tab locks.
    await user.selectOptions(screen.getByLabelText('Team size'), '4');
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await user.click(screen.getByRole('button', { name: 'Trainer' }));
    await user.click(await screen.findByRole('button', { name: /Start practice draft/ }));
    await waitFor(() => expect(document.querySelector('.choice')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: 'Matrix' }));
    expect(screen.getByText(/practice draft is in progress/i)).toBeInTheDocument();

    // Isolate the discard's own reset from the matrix-change effect's resets
    // (which fire on load because the injected solve starts already-done).
    vi.mocked(solve.reset).mockClear();

    // "Discard draft to edit" clears both the draft and the solver result.
    await user.click(screen.getByRole('button', { name: /discard draft to edit/i }));
    expect(solve.reset).toHaveBeenCalled();
    expect(screen.queryByText(/practice draft is in progress/i)).not.toBeInTheDocument();
  });

  test('the Local-only pill opens (and closes) the privacy explainer', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.queryByText(/Everything stays on your computer/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Local-only/i }));
    expect(screen.getByText(/Everything stays on your computer/i)).toBeInTheDocument();
    expect(screen.getByText(/Built for practice, not for live events/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByText(/Everything stays on your computer/i)).not.toBeInTheDocument();
  });
});
