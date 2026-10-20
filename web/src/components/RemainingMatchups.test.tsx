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
      maps: [bestOf(c), worstOf(c), Math.round(worstOf(c) + 0.25 * (bestOf(c) - worstOf(c)))] as [number, number, number],
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
    container.querySelector<HTMLElement>(`[data-matchup="${matrix.myNames[m]} vs ${matrix.enemyNames[e]}"]`)!;
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

  test('each tile is an image with a full label: average, every map, and the played one', () => {
    const { container } = renderGrid(model);
    const m = myDefender;
    const e = model.enemyRemaining.find((x) => x !== enemyDefender)!;
    const maps = matrix.cells[m][e].maps as number[];
    const scores = maps.map((v) => v + 10);
    const avg = Math.round(scores.reduce((a, v) => a + v, 0) / 3);
    const played = MAP_LETTERS[maps.indexOf(Math.max(...maps))]; // my defender: best map
    const parts = MAP_LETTERS.map((l, k) => `map ${l} ${scores[k]}${l === played ? ' (played)' : ''}`);
    const name = `${matrix.myNames[m]} vs ${matrix.enemyNames[e]}: ${avg} average; ${parts.join(', ')}`;
    const t = within(container).getByRole('img', { name });
    expect(t).toBe(tile(container, m, e));
    expect(name).toContain('(played)');
  });

  test('an unrated map reads as unrated, and without identity the label is just the value', () => {
    const open = fixtureMatrix(smoke);
    const { container } = renderGrid(afterDefenders(open));
    const first = container.querySelector<HTMLElement>('.tile')!;
    expect(first.getAttribute('role')).toBe('img');
    expect(first.getAttribute('aria-label')).toMatch(/^.+ vs .+: \d+$/);

    const partial = mapsMatrix();
    partial.cells[0][0] = { maps: [partial.cells[0][0].maps[0], partial.cells[0][0].maps[1], null] };
    const pm = initDraft(partial, smoke.neutralWeight);
    const { container: c2 } = renderGrid(pm);
    const label = c2.querySelector<HTMLElement>(
      `[data-matchup="${partial.myNames[0]} vs ${partial.enemyNames[0]}"]`,
    )!.getAttribute('aria-label')!;
    expect(label).toContain('map C unrated');
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
