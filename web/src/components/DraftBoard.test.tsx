// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { fixtureMatrix, smoke } from '../conformance/fixtures';
import { initDraft } from '../draft/draftState';
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
});
