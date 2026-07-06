// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, within } from '@testing-library/react';
import { expect, test } from 'vitest';
import { fixtureMatrix, smoke } from '../conformance/fixtures';
import { DraftEngine } from '../engine/engine';
import { initDraft } from '../draft/draftState';
import { WhyPanel } from './WhyPanel';

/** A solved Smoke engine plus a fresh draft model at the defender stage. */
function setup() {
  const matrix = fixtureMatrix(smoke);
  const engine = new DraftEngine(matrix, null, smoke.neutralWeight);
  engine.solve();
  return { matrix, engine, model: initDraft(matrix, smoke.neutralWeight) };
}

test('attackers stage: shows the attacker-pair EV list, one row per offered pair', () => {
  const { matrix, engine } = setup();
  // Lock an arbitrary defender move to reach an attackers-stage node.
  const base = initDraft(matrix, smoke.neutralWeight);
  const myDef = engine.nodeResult([]).choices[0].id as number;
  const enDef = base.enemyRemaining[0];
  const model = { ...base, myDefender: myDef, enemyDefender: enDef, path: [{ stage: 'defender' as const, my: myDef, enemy: enDef }] };
  const node = engine.nodeResult(model.path);

  const { container } = render(<WhyPanel node={node} model={model} />);
  const q = within(container);
  expect(q.getByText(/Team EV per attacker pair choice/i)).toBeInTheDocument();
  expect(container.querySelectorAll('.ev-table tr').length).toBe(node.choices.length);
});

test('defender stage: renders nothing — the "why" folds into the per-card hints', () => {
  const { engine, model } = setup();
  const node = engine.nodeResult([]);
  const { container } = render(<WhyPanel node={node} model={model} />);
  expect(container.querySelector('.why')).toBeNull();
  expect(container.querySelector('.why-threats')).toBeNull();
});
