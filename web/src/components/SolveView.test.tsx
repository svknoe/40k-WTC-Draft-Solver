// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { SolvedEvent } from '../engine/types';
import type { SolveState } from '../worker/useSolve';
import { SolveView } from './SolveView';

const base = { solve: vi.fn(), reset: vi.fn(), node: vi.fn(), solvedK: null };

const result: SolvedEvent = {
  type: 'solved',
  reqId: 1,
  expected: 5,
  root: {
    stage: 'defender',
    side: 'simultaneous',
    round: 1,
    choices: [
      { id: 0, name: 'Alice', prob: 0.8, ev: 5.5 },
      { id: 1, name: 'Bob', prob: 0.2, ev: 4.0 },
    ],
    why: {
      rowLabels: ['Alice', 'Bob'],
      colLabels: ['Xena', 'Yuri'],
      payoff: [[5, 4], [3, 6]],
      myStrategy: [0.8, 0.2],
      enStrategy: [0.7, 0.3],
    },
  },
};

describe('SolveView', () => {
  test('done: shows the 0-160 expected result and both opening mixes', () => {
    const solve: SolveState = { ...base, status: 'done', progress: 1, phase: null, result, error: null };
    render(<SolveView myTeam="Norway" enemyTeam="Scotland" n={8} canRun solve={solve} k={null} onKChange={() => {}} onRun={() => {}} />);
    expect(screen.getByText('85')).toBeInTheDocument(); // 80 + 5
    expect(screen.getByText('75')).toBeInTheDocument(); // 80 - 5
    expect(screen.getByText(/Norway favored by 5/)).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('Xena')).toBeInTheDocument(); // enemy mix from colLabels
    expect(screen.getByText('70%')).toBeInTheDocument();
  });

  test('idle: offers exact vs fast-preview and gates Run on canRun', () => {
    const solve: SolveState = { ...base, status: 'idle', progress: 0, phase: null, result: null, error: null };
    render(<SolveView myTeam="A" enemyTeam="B" n={8} canRun={false} solve={solve} k={null} onKChange={() => {}} onRun={() => {}} />);
    expect(screen.getByRole('button', { name: 'Run solver' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Exact' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Fast preview/ })).toBeInTheDocument();
  });

  test('solving: shows a live progress bar', () => {
    const solve: SolveState = { ...base, status: 'solving', progress: 0.4, phase: 'inducting', result: null, error: null };
    render(<SolveView myTeam="A" enemyTeam="B" n={8} canRun solve={solve} k={null} onKChange={() => {}} onRun={() => {}} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
  });
});
