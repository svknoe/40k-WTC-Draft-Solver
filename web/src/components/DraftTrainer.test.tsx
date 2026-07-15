// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
        onSolve={() => {}}
        onEditMatrix={() => {}}
      />,
    );

    // The intro restores the privacy / WTC-lock bullet.
    expect(within(container).getByText(/never uploaded/i)).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: /Start practice draft/ }));

    // The draft board renders for the active round.
    expect(await within(container).findByText(/Our defender · our map/i)).toBeInTheDocument();

    // A 4×4 draft is one round: defender → attackers → refusal. The attackers
    // step needs two cards picked (individual attackers); the others need one.
    for (let step = 0; step < 3; step++) {
      await waitFor(() => {
        if (!container.querySelector('.choice')) throw new Error('choices not rendered yet');
      });
      const cards = () => [...container.querySelectorAll('.choice')] as HTMLElement[];
      // The pairing step's confirm button reads "X faces Y", not "Lock …", and
      // an "Auto pick" button may precede it in the bar, so grab the lock-bar's
      // primary (Lock/confirm) button by its class rather than name or position.
      const lockBtn = () => container.querySelector('.lock-bar button.primary') as HTMLButtonElement;
      await user.click(cards()[0]);
      if (/attackers/.test(lockBtn().textContent ?? '')) await user.click(cards()[1]);
      await user.click(lockBtn());
    }

    // Reaching 'done' renders the summary.
    expect(await screen.findByRole('button', { name: /Draft again/ })).toBeInTheDocument();
    expect(screen.getByText(/Final pairings/i)).toBeInTheDocument();
  });

  test('Auto pick fills an equilibrium selection without locking (hints only)', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DraftTrainer
        matrix={fixtureMatrix(smoke)}
        myTeam="Us"
        enemyTeam="Them"
        neutralWeight={smoke.neutralWeight}
        solve={engineSolveState()}
        onSolve={() => {}}
        onEditMatrix={() => {}}
      />,
    );
    await user.click(await screen.findByRole('button', { name: /Start practice draft/ }));
    await waitFor(() => expect(container.querySelector('.choice')).toBeTruthy());

    // Hints are on by default, so Auto pick is offered to the LEFT of the
    // primary Lock button.
    const barButtons = () => [...container.querySelectorAll('.lock-bar button')] as HTMLButtonElement[];
    expect(barButtons()[0]).toHaveTextContent('Auto pick');
    expect(barButtons()[1]).toHaveClass('primary');

    // Defender stage: Auto pick sets exactly one selection and does NOT advance.
    expect(container.querySelector('.choice.selected')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Auto pick' }));
    expect(container.querySelectorAll('.choice.selected')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Lock defender' })).toBeInTheDocument();

    // Advance to the attackers stage; Auto pick fills BOTH attacker cards
    // (it samples a whole pair), still without locking.
    await user.click(screen.getByRole('button', { name: 'Lock defender' }));
    await screen.findByRole('button', { name: 'Lock attackers' });
    await user.click(screen.getByRole('button', { name: 'Auto pick' }));
    expect(container.querySelectorAll('.choice.selected')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Lock attackers' })).toBeInTheDocument();

    // Turning hints off removes the button.
    await user.click(screen.getByRole('button', { name: /^Hints:/ }));
    expect(screen.queryByRole('button', { name: 'Auto pick' })).not.toBeInTheDocument();
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
          onSolve={() => {}}
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

  test('reports draft-live state to onLiveChange', async () => {
    const user = userEvent.setup();
    const onLiveChange = vi.fn();
    const { container } = render(
      <DraftTrainer
        matrix={fixtureMatrix(smoke)}
        myTeam="Us"
        enemyTeam="Them"
        neutralWeight={smoke.neutralWeight}
        solve={engineSolveState()}
        onSolve={() => {}}
        onEditMatrix={() => {}}
        onLiveChange={onLiveChange}
      />,
    );

    // Intro screen: no draft in progress yet.
    expect(onLiveChange).toHaveBeenLastCalledWith(false);

    await user.click(await screen.findByRole('button', { name: /Start practice draft/ }));
    await waitFor(() => expect(container.querySelector('.choice')).toBeTruthy());

    // A draft is now under way.
    expect(onLiveChange).toHaveBeenLastCalledWith(true);
  });

  test('the attacker-pair "why" list folds into hints — no separate Why toggle', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DraftTrainer
        matrix={fixtureMatrix(smoke)}
        myTeam="Us"
        enemyTeam="Them"
        neutralWeight={smoke.neutralWeight}
        solve={engineSolveState()}
        onSolve={() => {}}
        onEditMatrix={() => {}}
      />,
    );
    await user.click(await screen.findByRole('button', { name: /Start practice draft/ }));

    // The "why" content is no longer behind its own toggle.
    expect(screen.queryByRole('button', { name: 'Why' })).not.toBeInTheDocument();

    // Advance to the attackers stage.
    await user.click(await waitFor(() => container.querySelector('.choice') as HTMLElement));
    await user.click(screen.getByRole('button', { name: 'Lock defender' }));
    await screen.findByRole('button', { name: 'Lock attackers' });

    // Hints are on by default, so the attacker-pair EV list shows automatically.
    expect(screen.getByText(/Team EV per attacker pair choice/i)).toBeInTheDocument();
  });

  test('two-player mode: toggle on the intro, both panels picked, both seats summarised', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DraftTrainer
        matrix={fixtureMatrix(smoke)}
        myTeam="Us"
        enemyTeam="Them"
        neutralWeight={smoke.neutralWeight}
        solve={engineSolveState()}
        onSolve={() => {}}
        onEditMatrix={() => {}}
      />,
    );

    // The mode toggle is available on the intro screen and flips the copy.
    const toggle = await screen.findByRole('button', { name: /Opponent: bot/ });
    expect(toggle).toBeEnabled();
    await user.click(toggle);
    expect(screen.getByRole('button', { name: /Opponent: you/ })).toBeInTheDocument();
    expect(screen.getByText(/both sides/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Start practice draft/ }));
    await waitFor(() => {
      if (!container.querySelector('.choice-panel.enemy .choice')) throw new Error('panels not rendered yet');
    });

    // Fixed per draft: the toggle disables while the draft is live.
    expect(screen.getByRole('button', { name: /Opponent: you/ })).toBeDisabled();

    for (let step = 0; step < 3; step++) {
      await waitFor(() => {
        if (!container.querySelector('.choice-panel.enemy .choice')) throw new Error('choices not rendered yet');
      });
      const mine = () => [...container.querySelectorAll('.choice-panel.mine .choice')] as HTMLElement[];
      const theirs = () => [...container.querySelectorAll('.choice-panel.enemy .choice')] as HTMLElement[];
      const lockBtn = () => container.querySelector('.lock-bar button.primary') as HTMLButtonElement;

      await user.click(mine()[0]);
      expect(lockBtn()).toBeDisabled(); // the opponent seat hasn't picked yet
      await user.click(theirs()[0]);
      if (/attackers/.test(lockBtn().textContent ?? '')) {
        await user.click(mine()[1]);
        await user.click(theirs()[1]);
      }
      await user.click(lockBtn());
    }

    // The summary scores both seats and shows the reveal luck.
    expect(await screen.findByRole('button', { name: /Draft again/ })).toBeInTheDocument();
    expect(screen.getByText(/Your draft/i)).toBeInTheDocument();
    expect(screen.getByText(/Their draft/i)).toBeInTheDocument();
    expect(screen.getByText(/reveal luck/i)).toBeInTheDocument();
  });

  test('two-player mode: Auto pick fills both panels', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DraftTrainer
        matrix={fixtureMatrix(smoke)}
        myTeam="Us"
        enemyTeam="Them"
        neutralWeight={smoke.neutralWeight}
        solve={engineSolveState()}
        onSolve={() => {}}
        onEditMatrix={() => {}}
      />,
    );
    await user.click(await screen.findByRole('button', { name: /Opponent: bot/ }));
    await user.click(screen.getByRole('button', { name: /Start practice draft/ }));
    await waitFor(() => expect(container.querySelector('.choice-panel.enemy .choice')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: 'Auto pick' }));
    expect(container.querySelectorAll('.choice-panel.mine .choice.selected')).toHaveLength(1);
    expect(container.querySelectorAll('.choice-panel.enemy .choice.selected')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Lock defender' })).toBeEnabled();
  });

  test('bot mode renders a single unlabelled panel (no enemy choices)', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DraftTrainer
        matrix={fixtureMatrix(smoke)}
        myTeam="Us"
        enemyTeam="Them"
        neutralWeight={smoke.neutralWeight}
        solve={engineSolveState()}
        onSolve={() => {}}
        onEditMatrix={() => {}}
      />,
    );
    await user.click(await screen.findByRole('button', { name: /Start practice draft/ }));
    await waitFor(() => expect(container.querySelector('.choice')).toBeTruthy());
    expect(container.querySelector('.choice-panel.enemy')).toBeNull();
    expect(container.querySelector('.panel-label')).toBeNull();
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
        onSolve={() => {}}
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
