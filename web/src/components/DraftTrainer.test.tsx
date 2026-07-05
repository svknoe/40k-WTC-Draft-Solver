// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { fixtureMatrix, smoke } from '../conformance/fixtures';
import { DraftEngine } from '../engine/engine';
import type { Move } from '../engine/types';
import type { SolveState } from '../worker/useSolve';
import { DraftTrainer } from './DraftTrainer';

/** A SolveState backed by a real exact engine — node() walks the real tree, so
 * the trainer plays against genuine equilibrium strategies (no worker). */
function engineSolveState(): SolveState {
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

describe('DraftTrainer (Smoke 4×4, real engine)', () => {
  test('plays a full draft from intro to the summary', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DraftTrainer
        matrix={fixtureMatrix(smoke)}
        myTeam="Us"
        enemyTeam="Them"
        neutralWeight={smoke.neutralWeight}
        solve={engineSolveState()}
        botStyle="greedy"
        onBotStyleChange={() => {}}
        onEditMatrix={() => {}}
      />,
    );

    await user.click(await screen.findByRole('button', { name: /Start practice draft/ }));

    // A 4×4 draft is one round: defender → attackers → refusal.
    for (let step = 0; step < 3; step++) {
      const choice = await waitFor(() => {
        const first = container.querySelector('.choice');
        if (!first) throw new Error('choices not rendered yet');
        return first as HTMLElement;
      });
      await user.click(choice);
      await user.click(screen.getByRole('button', { name: /^Lock/ }));
    }

    // Reaching 'done' renders the summary.
    expect(await screen.findByRole('button', { name: /Draft again/ })).toBeInTheDocument();
    expect(screen.getByText(/Final pairings/i)).toBeInTheDocument();
  });

  test('coaching hints lock off during an official WTC window', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); // fake only Date; keep microtasks/timers real
    vi.setSystemTime(new Date(2026, 7, 13)); // Aug 13 2026 — inside WTC 2026
    try {
      const { container } = render(
        <DraftTrainer
          matrix={fixtureMatrix(smoke)}
          myTeam="Us"
          enemyTeam="Them"
          neutralWeight={smoke.neutralWeight}
          solve={engineSolveState()}
          botStyle="greedy"
          onBotStyleChange={() => {}}
          onEditMatrix={() => {}}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /Start practice draft/ }));
      await waitFor(() => expect(container.querySelector('.choice')).toBeTruthy());
      expect(screen.getByRole('button', { name: /^Hints:/ })).toBeDisabled();
      expect(screen.getByText(/is under way/i)).toBeInTheDocument();
      expect(container.querySelector('.cprob')).toBeNull(); // no per-choice hint numbers
    } finally {
      vi.useRealTimers();
    }
  });

  test('undo steps back a decision', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DraftTrainer
        matrix={fixtureMatrix(smoke)}
        myTeam="Us"
        enemyTeam="Them"
        neutralWeight={smoke.neutralWeight}
        solve={engineSolveState()}
        botStyle="greedy"
        onBotStyleChange={() => {}}
        onEditMatrix={() => {}}
      />,
    );
    await user.click(await screen.findByRole('button', { name: /Start practice draft/ }));

    // Lock the defender, advance to attackers, then undo back to defender.
    await user.click(await waitFor(() => container.querySelector('.choice') as HTMLElement));
    await user.click(screen.getByRole('button', { name: 'Lock defender' }));
    await screen.findByRole('button', { name: 'Lock attackers' });
    await user.click(screen.getByRole('button', { name: /Undo/ }));
    expect(await screen.findByRole('button', { name: 'Lock defender' })).toBeInTheDocument();
  });
});
