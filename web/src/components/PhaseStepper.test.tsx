// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, within } from '@testing-library/react';
import { expect, test } from 'vitest';
import { PhaseStepper } from './PhaseStepper';

test('marks the active stage and not the others', () => {
  const { container } = render(<PhaseStepper stage="attackers" />);
  const q = within(container);
  expect(q.getByText('Attackers').className).toMatch(/on/);
  expect(q.getByText('Defenders').className).not.toMatch(/on/);
  expect(q.getByText('Refusal').className).not.toMatch(/on/);
});
