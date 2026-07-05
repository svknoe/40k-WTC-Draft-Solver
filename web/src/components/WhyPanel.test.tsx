// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, within } from '@testing-library/react';
import { expect, test } from 'vitest';
import { fixtureMatrix, smoke } from '../conformance/fixtures';
import { DraftEngine } from '../engine/engine';
import { initDraft } from '../draft/draftState';
import { WhyPanel } from './WhyPanel';

test('defender stage: shows both the EV-per-choice list and the threat sub-matrix', () => {
  const matrix = fixtureMatrix(smoke);
  const model = initDraft(matrix, smoke.neutralWeight);
  const engine = new DraftEngine(matrix, null, smoke.neutralWeight);
  engine.solve();
  const node = engine.nodeResult([]);

  const { container } = render(
    <WhyPanel node={node} model={model} myNames={matrix.myNames} enemyNames={matrix.enemyNames} />,
  );
  const q = within(container);

  expect(q.getByText(/Team EV per defender choice/i)).toBeInTheDocument();
  expect(q.getByText(/Score vs their biggest threats/i)).toBeInTheDocument();
  // One EV row per candidate defender.
  expect(container.querySelectorAll('.ev-table tr').length).toBe(node.choices.length);
});
