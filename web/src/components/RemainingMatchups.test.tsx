// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { fixtureMatrix, smoke } from '../conformance/fixtures';
import { applyStep, contextKind, initDraft } from '../draft/draftState';
import type { DraftModel } from '../draft/draftState';
import { DraftEngine } from '../engine/engine';
import { bestOf, worstOf } from '../engine/maps';
import { MAP_LETTERS } from '../engine/types';
import type { Matrix } from '../engine/types';
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
  // preventDefault keeps React in control: the native toggle did not flip it.
  expect(details.open).toBe(false);
  rerender(<RemainingMatchups model={model} myNames={matrix.myNames} enemyNames={matrix.enemyNames}
    open onOpenChange={onOpenChange} />);
  expect(details.open).toBe(true);
});

/** The smoke 4×4 with distinct A/B/C ratings per cell (C between worst and
 * best, so best/worst — and the solved values — are unchanged), neutral map C. */
function mapsMatrix(): Matrix {
  const matrix = fixtureMatrix(smoke);
  return {
    ...matrix,
    neutralMap: 'C',
    cells: matrix.cells.map((row) => row.map((c) => ({
      maps: [bestOf(c), worstOf(c), worstOf(c) + 0.25 * (bestOf(c) - worstOf(c))] as [number, number, number],
    }))),
  };
}

function afterDefenders(matrix: Matrix): DraftModel {
  const engine = new DraftEngine(matrix, null, smoke.neutralWeight);
  engine.solve();
  const fresh = initDraft(matrix, smoke.neutralWeight);
  const node = engine.nodeResult(fresh.path);
  const argmax = (v: number[]) => v.indexOf(Math.max(...v));
  return applyStep(fresh, node, argmax(node.choices.map((c) => c.prob)), argmax(node.why!.enStrategy));
}

const renderGrid = (model: DraftModel, extra: Partial<Parameters<typeof RemainingMatchups>[0]> = {}) =>
  render(
    <RemainingMatchups model={model} myNames={model.matrix.myNames} enemyNames={model.matrix.enemyNames}
      open onOpenChange={() => {}} {...extra} />,
  );

describe('matrix tiles', () => {
  const matrix = mapsMatrix();
  const model = afterDefenders(matrix);
  const { myDefender, enemyDefender } = model;
  const tile = (container: HTMLElement, m: number, e: number) =>
    container.querySelector<HTMLElement>(`[aria-label="${matrix.myNames[m]} vs ${matrix.enemyNames[e]}"]`)!;
  const playedLetters = (el: HTMLElement) =>
    [...el.querySelectorAll('.map-cell.played')].map((x) => x.getAttribute('title')!.replace('Played on map ', ''));

  test('every remaining pairing is a palette-coloured tile with a three-entry strip', () => {
    const { container } = renderGrid(model);
    expect(container.querySelectorAll('.tile')).toHaveLength(model.myRemaining.length * model.enemyRemaining.length);
    for (const m of model.myRemaining) {
      for (const e of model.enemyRemaining) {
        const t = tile(container, m, e);
        expect(t).toBeInTheDocument();
        expect(t.className).toMatch(/(^|\s)pt-\d+(\s|$)/);
        expect(t.querySelectorAll('.tile-maps .map-cell')).toHaveLength(3);
        const avg = (matrix.cells[m][e].maps as number[]).reduce((a, v) => a + v + 10, 0) / 3;
        expect(t.querySelector('.tile-value')!.textContent).toBe(String(Math.round(avg)));
      }
    }
  });

  test('marks the map that would be played given the draft roles', () => {
    const { container } = renderGrid(model);
    const letterOf = (m: number, e: number, pick: (xs: number[]) => number) => {
      const maps = matrix.cells[m][e].maps as number[];
      return MAP_LETTERS[maps.indexOf(pick(maps))];
    };
    for (const m of model.myRemaining) {
      for (const e of model.enemyRemaining) {
        const kind = contextKind(model, m, e);
        const t = tile(container, m, e);
        if (m === myDefender && e === enemyDefender) {
          expect(kind).toBeNull();
          expect(playedLetters(t)).toEqual([]);
          expect(t.querySelector('.tile-maps')!.classList.contains('has-played')).toBe(false);
        } else if (m === myDefender) {
          expect(playedLetters(t)).toEqual([letterOf(m, e, (xs) => Math.max(...xs))]);
        } else if (e === enemyDefender) {
          expect(playedLetters(t)).toEqual([letterOf(m, e, (xs) => Math.min(...xs))]);
        } else {
          expect(playedLetters(t)).toEqual(['C']); // final round: neutral map
        }
        if (kind) expect(t.querySelector('.tile-maps')!.classList.contains('has-played')).toBe(true);
      }
    }
  });

  test('without map identity there is no strip and nothing is marked', () => {
    const plain = fixtureMatrix(smoke);
    const { container } = renderGrid(afterDefenders(plain));
    expect(container.querySelectorAll('.tile')).toHaveLength(16);
    expect(container.querySelector('.tile-maps')).toBeNull();
    expect(container.querySelector('.played')).toBeNull();
  });

  test('dispositions render as pills in the row head, only for players that have one', () => {
    const { container } = renderGrid(model, {
      myDispositions: ['hold', '', '', ''],
      enemyDispositions: ['', 'purge', '', ''],
    });
    const rowHeads = container.querySelectorAll('.row-head');
    expect(rowHeads).toHaveLength(4);
    expect(within(rowHeads[0] as HTMLElement).getByText('HOLD')).toBeInTheDocument();
    for (const h of [1, 2, 3]) expect(rowHeads[h].querySelector('.disp')).toBeNull();
    const colHeads = container.querySelectorAll('.col-head');
    expect(within(colHeads[1] as HTMLElement).getByText('PURGE')).toBeInTheDocument();
    expect(container.querySelectorAll('.disp')).toHaveLength(2);
  });
});
