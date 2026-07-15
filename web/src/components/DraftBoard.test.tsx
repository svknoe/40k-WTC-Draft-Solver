// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { fixtureMatrix, smoke } from '../conformance/fixtures';
import { initDraft } from '../draft/draftState';
import type { Matrix } from '../engine/types';
import { DraftBoard } from './DraftBoard';

describe('DraftBoard', () => {
  test('defender stage: our defender is selecting…, their defender hidden', () => {
    const matrix = fixtureMatrix(smoke);
    const model = initDraft(matrix, smoke.neutralWeight);
    const { container } = render(
      <DraftBoard model={model} myNames={matrix.myNames} enemyNames={matrix.enemyNames} />,
    );
    const q = within(container);

    expect(q.getByText(/Our defender/i)).toBeInTheDocument();
    expect(q.getByText(/Their defender/i)).toBeInTheDocument();
    expect(q.getByText('selecting…')).toBeInTheDocument();
    expect(q.getByText(/Their two attackers will land here/i)).toBeInTheDocument();
    expect(q.getByText(/Your two attackers will land here/i)).toBeInTheDocument();
  });

  test('fills locked defenders and attackers from the model', () => {
    const matrix = fixtureMatrix(smoke);
    const base = initDraft(matrix, smoke.neutralWeight);
    const model = {
      ...base,
      myDefender: 0,
      enemyDefender: 1,
      myPair: [2, 3] as [number, number],
      enemyPair: [1, 2] as [number, number],
    };
    const { container } = render(
      <DraftBoard model={model} myNames={matrix.myNames} enemyNames={matrix.enemyNames} />,
    );
    const q = within(container);

    expect(q.getByText(matrix.myNames[0])).toBeInTheDocument(); // our defender
    expect(q.getByText(matrix.myNames[2])).toBeInTheDocument(); // our attacker
    expect(q.queryByText('selecting…')).not.toBeInTheDocument();
  });

  test('2P defender stage: previews both seats defenders', () => {
    const matrix = fixtureMatrix(smoke);
    const model = initDraft(matrix, smoke.neutralWeight, true);
    const { container } = render(
      <DraftBoard
        model={model}
        myNames={matrix.myNames}
        enemyNames={matrix.enemyNames}
        pending={{ defender: 0, attackers: [], face: null, enemyDefender: 2 }}
      />,
    );
    const q = within(container);
    expect(q.getByText(matrix.myNames[0]).closest('.slot')).toHaveClass('def', 'mine', 'on');
    // the opponent seat's pending defender fills + lights (hidden '?' in bot mode)
    expect(q.getByText(matrix.enemyNames[2]).closest('.slot')).toHaveClass('def', 'enemy', 'filled', 'on');
    expect(q.queryByText('selecting…')).not.toBeInTheDocument(); // my defender filled from pending
  });

  test('2P attackers stage: previews the opponent seat attackers on our defender', () => {
    const matrix = fixtureMatrix(smoke);
    const base = initDraft(matrix, smoke.neutralWeight, true);
    const model = { ...base, myDefender: 0, enemyDefender: 0 };
    const { container } = render(
      <DraftBoard
        model={model}
        myNames={matrix.myNames}
        enemyNames={matrix.enemyNames}
        pending={{ defender: null, attackers: [], face: null, enemyAttackers: [1, 2] }}
      />,
    );
    const q = within(container);
    for (const e of [1, 2]) {
      expect(q.getByText(matrix.enemyNames[e]).closest('.slot')).toHaveClass('atk', 'enemy', 'filled', 'on');
    }
  });

  test('2P pairing stage: faced attacker stays lit, refused one dims; auto-pair previews both seats', () => {
    const matrix = fixtureMatrix(smoke);
    const base = initDraft(matrix, smoke.neutralWeight, true);
    const model = {
      ...base,
      round: 1, // = finalRound for n=4, so the auto-pair panel shows
      myDefender: 0,
      enemyDefender: 0,
      myPair: [1, 2] as [number, number],
      enemyPair: [1, 2] as [number, number],
    };
    const { container } = render(
      <DraftBoard
        model={model}
        myNames={matrix.myNames}
        enemyNames={matrix.enemyNames}
        pending={{ defender: null, attackers: [], face: 1, enemyFace: 1 }}
      />,
    );
    const q = within(container);
    // enemyFace = 1: my attacker their defender faces stays lit; the other dims.
    expect(q.getByText(matrix.myNames[1]).closest('.slot')).toHaveClass('on');
    expect(q.getByText(matrix.myNames[2]).closest('.slot')).toHaveClass('muted');
    // face = 1: symmetric on the enemy attackers landing on our defender.
    expect(q.getByText(matrix.enemyNames[1]).closest('.slot')).toHaveClass('on');
    expect(q.getByText(matrix.enemyNames[2]).closest('.slot')).toHaveClass('muted');
    // Auto-pair panel: refMine/refThem (each side's refused attacker) + last players.
    const panel = q.getByText(/Auto-paired this round/i).closest('.board-panel')!;
    expect(panel).toHaveTextContent(`refused: ${matrix.myNames[2]} vs ${matrix.enemyNames[2]}`);
    expect(panel).toHaveTextContent(`${matrix.myNames[3]} vs ${matrix.enemyNames[3]}`); // LAST
  });

  test('odd-size final round: auto-pair panel shows refused, no LAST slot', () => {
    const matrix: Matrix = {
      n: 5,
      myNames: ['F0', 'F1', 'F2', 'F3', 'F4'],
      enemyNames: ['E0', 'E1', 'E2', 'E3', 'E4'],
      cells: Array.from({ length: 5 }, () =>
        Array.from({ length: 5 }, () => ({ best: 0, worst: 0 }))),
    };
    const base = initDraft(matrix, 0.5);
    const model = {
      ...base,
      round: 2, // = finalRound for n=5
      myRemaining: [1, 3, 4],
      enemyRemaining: [1, 3, 4],
      myDefender: 1,
      enemyDefender: 1,
      myPair: [3, 4] as [number, number],
      enemyPair: [3, 4] as [number, number],
    };
    const { container } = render(
      <DraftBoard model={model} myNames={matrix.myNames} enemyNames={matrix.enemyNames} />,
    );
    const q = within(container);
    expect(q.getByText(/Auto-paired this round/i)).toBeInTheDocument();
    expect(q.getByText(/refused:/i)).toBeInTheDocument();
    expect(q.queryByText('LAST')).not.toBeInTheDocument();
  });
});
