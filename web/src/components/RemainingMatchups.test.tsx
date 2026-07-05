// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, within } from '@testing-library/react';
import { expect, test } from 'vitest';
import { fixtureMatrix, smoke } from '../conformance/fixtures';
import { initDraft } from '../draft/draftState';
import { RemainingMatchups } from './RemainingMatchups';

test('summarises the remaining grid size', () => {
  const matrix = fixtureMatrix(smoke);
  const model = initDraft(matrix, smoke.neutralWeight);
  const { container } = render(
    <RemainingMatchups model={model} myNames={matrix.myNames} enemyNames={matrix.enemyNames} />,
  );
  const q = within(container);
  expect(
    q.getByText(new RegExp(`${model.myRemaining.length}\\s*[×x]\\s*${model.enemyRemaining.length}`)),
  ).toBeInTheDocument();
});
