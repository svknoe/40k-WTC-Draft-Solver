// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { fixtureMatrix, smoke } from '../conformance/fixtures';
import { initDraft } from '../draft/draftState';
import { RemainingMatchups } from './RemainingMatchups';

test('summarises the remaining grid size', () => {
  const matrix = fixtureMatrix(smoke);
  const model = initDraft(matrix, smoke.neutralWeight);
  const { container } = render(
    <RemainingMatchups model={model} myNames={matrix.myNames} enemyNames={matrix.enemyNames}
      open={false} onOpenChange={() => {}} />,
  );
  const q = within(container);
  expect(
    q.getByText(new RegExp(`${model.myRemaining.length}\\s*[×x]\\s*${model.enemyRemaining.length}`)),
  ).toBeInTheDocument();
});

test('is controlled: renders open when told to, and reports toggles', async () => {
  const matrix = fixtureMatrix(smoke);
  const model = initDraft(matrix, smoke.neutralWeight);
  const onOpenChange = vi.fn();
  const { container, rerender } = render(
    <RemainingMatchups model={model} myNames={matrix.myNames} enemyNames={matrix.enemyNames}
      open={false} onOpenChange={onOpenChange} />,
  );
  const details = container.querySelector('details')!;
  expect(details.open).toBe(false);
  await userEvent.setup().click(container.querySelector('summary')!);
  expect(onOpenChange).toHaveBeenCalledWith(true);
  rerender(<RemainingMatchups model={model} myNames={matrix.myNames} enemyNames={matrix.enemyNames}
    open onOpenChange={onOpenChange} />);
  expect(details.open).toBe(true);
});
