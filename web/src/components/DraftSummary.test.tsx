// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { fixtureMatrix, smoke } from '../conformance/fixtures';
import type { FixedGame } from '../draft/draftState';
import { initDraft } from '../draft/draftState';
import { DraftSummary } from './DraftSummary';

function renderWith(fixed: FixedGame[]) {
  const matrix = fixtureMatrix(smoke);
  const model = { ...initDraft(matrix, smoke.neutralWeight), fixed, done: true };
  render(
    <DraftSummary
      myTeam="Mine" enemyTeam="Theirs"
      myNames={matrix.myNames} enemyNames={matrix.enemyNames}
      expected={0} model={model}
      onReplay={vi.fn()} onEditMatrix={vi.fn()}
    />,
  );
}

describe('DraftSummary pairings', () => {
  test('a game with a map shows its label followed by the map letter', () => {
    renderWith([{ my: 0, enemy: 1, kind: 'my-defends', value: 1, round: 1, map: 'B' }]);
    expect(screen.getByText('your map · B')).toBeInTheDocument();
  });

  test('a game without a map shows the bare label', () => {
    renderWith([{ my: 0, enemy: 1, kind: 'enemy-defends', value: 1, round: 1, map: null }]);
    expect(screen.getByText('their map')).toBeInTheDocument();
  });
});
