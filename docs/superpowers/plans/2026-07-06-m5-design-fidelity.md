# M5 Design Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `web/` back in line with `docs/design-mockup.html` — load the real IBM Plex fonts, rebuild the Trainer as the design's game board, and fix the Solver layout + brand polish.

**Architecture:** Three sliced PRs off `main`, in priority order. No engine/worker/solver/fixture changes — only `web/src/` UI components, CSS, and new pure helpers under `web/src/draft/`. New logic is factored into pure, unit-tested functions; components consume them.

**Tech Stack:** React 19 + TypeScript + Vite 8, Vitest + Testing Library, `@fontsource` for self-hosted fonts. Portable node at `C:\Users\svkno\AppData\Local\node-portable\node-v24.18.0-win-x64\node.exe`; run npm/vitest through it.

## Global Constraints

- No changes to `web/src/engine/**`, `web/src/worker/**`, or `web/src/conformance/**`. Fixtures stay green.
- Human-facing scores are the 0–20 community scale; engine values are internal (`score − 10`). Convert with `toScore` from `web/src/model/scale.ts` at the UI boundary only.
- Colour bands come from `scoreBand` (`web/src/model/scale.ts`) and the `--band-*` CSS vars in `theme.css`; do not hardcode band colours.
- Fonts must be self-hosted (no external network requests) to preserve the "nothing leaves the tab" guarantee.
- `my`/friendly accent = `--blue`; enemy accent = `--enemy`.
- Run `npm run typecheck` and full `vitest` (green) before finishing each PR.

---

## PR1 — Load IBM Plex (P0)

Branch: `m5-fonts`.

### Task 1: Self-host IBM Plex Sans + Mono

**Files:**
- Modify: `web/package.json` (dependencies)
- Modify: `web/src/main.tsx`

**Interfaces:**
- Produces: real IBM Plex Sans/Mono faces available to the existing `--font-sans`/`--font-mono` stacks in `theme.css`.

- [ ] **Step 1: Add the font packages**

Run (from repo root, using portable node's npm):
```bash
NODE="C:/Users/svkno/AppData/Local/node-portable/node-v24.18.0-win-x64"
"$NODE/npm.cmd" --prefix web install @fontsource/ibm-plex-sans@^5 @fontsource/ibm-plex-mono@^5
```
Expected: both appear under `dependencies` in `web/package.json`; `web/node_modules/@fontsource/...` exists.

- [ ] **Step 2: Import the weights actually used (400/500/600/700)**

Add to the TOP of `web/src/main.tsx`, before the app/theme imports:
```ts
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/ibm-plex-mono/700.css';
```

- [ ] **Step 3: Typecheck + tests**

Run:
```bash
"$NODE/npm.cmd" --prefix web run typecheck
"$NODE/npm.cmd" --prefix web test
```
Expected: typecheck clean; all tests pass (jsdom ignores `@import`; no test asserts on fonts).

- [ ] **Step 4: Manual verification**

Start the dev server; in the browser console confirm `document.fonts` now includes `IBM Plex Sans` and `IBM Plex Mono` (was 0). Numbers render in the mono face.

- [ ] **Step 5: Commit**

```bash
git add web/package.json web/package-lock.json web/src/main.tsx
git commit -m "feat(web): load self-hosted IBM Plex Sans + Mono (M5 P0)"
```

---

## PR2 — Trainer rebuild (P1)

Branch: `m5-trainer`. New pure helpers first (TDD), then components, then wire into `DraftTrainer`.

### Task 2: `candidateStats` helper

**Files:**
- Create: `web/src/draft/cards.ts`
- Test: `web/src/draft/cards.test.ts`

**Interfaces:**
- Consumes: `DraftModel` (`./draftState`), `NodeResult` (`../engine/types`), `toScore` (`../model/scale`).
- Produces: `candidateStats(model: DraftModel, node: NodeResult, choiceIndex: number): { avg: number; floor: number }` — decision-support stats on the 0–20 scale for one choice card.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'vitest';
import { fixtureMatrix, smoke } from '../conformance/fixtures';
import { DraftEngine } from '../engine/engine';
import { initDraft } from './draftState';
import { candidateStats } from './cards';

describe('candidateStats', () => {
  test('defender stage: avg + floor of my row over enemy remaining (best map)', () => {
    const matrix = fixtureMatrix(smoke);
    const model = initDraft(matrix, smoke.neutralWeight);
    const engine = new DraftEngine(matrix, null, smoke.neutralWeight);
    engine.solve();
    const node = engine.nodeResult([]);
    const s = candidateStats(model, node, 0);
    const my = node.choices[0].id as number;
    const vals = model.enemyRemaining.map((e) => matrix.cells[my][e].best + 10);
    expect(s.floor).toBe(Math.min(...vals));
    expect(s.avg).toBe(Math.round(vals.reduce((a, b) => a + b, 0) / vals.length));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `"$NODE/npm.cmd" --prefix web exec vitest run src/draft/cards.test.ts`
Expected: FAIL — `candidateStats` not exported.

- [ ] **Step 3: Implement**

```ts
import type { NodeResult } from '../engine/types';
import type { DraftModel } from './draftState';
import { toScore } from '../model/scale';

export interface CandidateStats {
  /** Mean expected score (0–20), rounded. */
  avg: number;
  /** Worst-case (minimum) expected score (0–20). */
  floor: number;
}

const mean = (xs: number[]): number => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);

/** Decision-support stats for one choice card, on the 0–20 score scale.
 * - defender: my row over the enemy remaining pool, best map (I pick the map).
 * - attackers: the two attackers' worst-map values vs their defender (they defend).
 * - refusal: the kept matchup (my defender vs the enemy attacker I keep), best map.
 * For refusal there is a single value, so avg === floor. */
export function candidateStats(model: DraftModel, node: NodeResult, choiceIndex: number): CandidateStats {
  const choice = node.choices[choiceIndex];
  const cells = model.matrix.cells;

  if (node.stage === 'defender') {
    const my = choice.id as number;
    const vals = model.enemyRemaining.map((e) => toScore(cells[my][e].best));
    return { avg: mean(vals), floor: Math.min(...vals) };
  }

  if (node.stage === 'attackers') {
    const [a, b] = choice.id as [number, number];
    const d = model.enemyDefender;
    const vals = [toScore(cells[a][d].worst), toScore(cells[b][d].worst)];
    return { avg: mean(vals), floor: Math.min(...vals) };
  }

  // refusal: choice.id = the enemy attacker I refuse; my defender keeps the other.
  const refuse = choice.id as number;
  const [ea, eb] = model.enemyPair!;
  const kept = ea === refuse ? eb : ea;
  const v = toScore(cells[model.myDefender][kept].best);
  return { avg: v, floor: v };
}
```

- [ ] **Step 4: Add attackers + refusal tests, then run all**

```ts
  test('attackers stage: worst-map values of the pair vs their defender', () => {
    const matrix = fixtureMatrix(smoke);
    const engine = new DraftEngine(matrix, null, smoke.neutralWeight);
    engine.solve();
    let model = initDraft(matrix, smoke.neutralWeight);
    const root = engine.nodeResult([]);
    // lock a defender move to reach the attackers node
    const myDef = root.choices[0].id as number;
    const enDef = model.enemyRemaining[0];
    model = { ...model, myDefender: myDef, enemyDefender: enDef, path: [{ stage: 'defender', my: myDef, enemy: enDef }] };
    const node = engine.nodeResult(model.path);
    const s = candidateStats(model, node, 0);
    const [a, b] = node.choices[0].id as [number, number];
    const vals = [matrix.cells[a][enDef].worst + 10, matrix.cells[b][enDef].worst + 10];
    expect(s.floor).toBe(Math.min(...vals));
  });
```

Run: `"$NODE/npm.cmd" --prefix web exec vitest run src/draft/cards.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/draft/cards.ts web/src/draft/cards.test.ts
git commit -m "feat(web): candidateStats helper for trainer choice cards"
```

### Task 3: `projectedResult` + `topThreats` helpers

**Files:**
- Modify: `web/src/draft/cards.ts`
- Modify: `web/src/draft/cards.test.ts`

**Interfaces:**
- Produces:
  - `projectedResult(model: DraftModel, node: NodeResult, expected: number): { projected: number; delta: number }` — internal-scale team margin if you play the best continuation from here, and its delta vs the solver's pre-draft `expected`.
  - `topThreats(model: DraftModel, node: NodeResult, k?: number): { enemyIndex: number; label: string; weight: number }[]` — the enemy's biggest threats at the defender stage (top-k by equilibrium weight). Empty for non-defender stages.

- [ ] **Step 1: Write failing tests**

```ts
import { projectedResult, topThreats } from './cards';

describe('projectedResult', () => {
  test('at the root, projected equals expected (delta 0)', () => {
    const matrix = fixtureMatrix(smoke);
    const model = initDraft(matrix, smoke.neutralWeight);
    const engine = new DraftEngine(matrix, null, smoke.neutralWeight);
    const expected = engine.solve();
    const node = engine.nodeResult([]);
    const { projected, delta } = projectedResult(model, node, expected);
    expect(projected).toBeCloseTo(expected, 6);
    expect(delta).toBeCloseTo(0, 6);
  });
});

describe('topThreats', () => {
  test('defender stage: returns top-k enemy remaining by equilibrium weight', () => {
    const matrix = fixtureMatrix(smoke);
    const model = initDraft(matrix, smoke.neutralWeight);
    const engine = new DraftEngine(matrix, null, smoke.neutralWeight);
    engine.solve();
    const node = engine.nodeResult([]);
    const threats = topThreats(model, node, 2);
    expect(threats.length).toBeLessThanOrEqual(2);
    const weights = threats.map((t) => t.weight);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights); // descending
    expect(model.enemyRemaining).toContain(threats[0].enemyIndex);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `"$NODE/npm.cmd" --prefix web exec vitest run src/draft/cards.test.ts`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Implement (append to `cards.ts`)**

```ts
/** Team margin (internal scale) if you play the best continuation from `node`,
 * plus how that compares to the solver's pre-draft equilibrium value. At the
 * root the best pure response equals the game value, so delta is ~0; as the
 * enemy's sampled reveals diverge from equilibrium, delta tracks how far
 * ahead/behind plan the realised draft is. */
export function projectedResult(model: DraftModel, node: NodeResult, expected: number): { projected: number; delta: number } {
  const achieved = model.fixed.reduce((sum, g) => sum + g.value, 0);
  const bestEv = node.choices.reduce((m, c) => Math.max(m, c.ev), -Infinity);
  const projected = achieved + bestEv;
  return { projected, delta: projected - expected };
}

export interface Threat {
  enemyIndex: number;
  label: string;
  weight: number;
}

/** The enemy's biggest threats at the defender stage: their equilibrium defender
 * mix (`node.why.enStrategy`) ranked descending, top-k. `colLabels` map 1:1 to
 * `model.enemyRemaining` at this stage. Empty for non-defender stages (the
 * threat sub-matrix is defender-specific). */
export function topThreats(model: DraftModel, node: NodeResult, k = 3): Threat[] {
  if (node.stage !== 'defender' || !node.why) return [];
  const why = node.why;
  return why.colLabels
    .map((label, j) => ({ enemyIndex: model.enemyRemaining[j], label, weight: why.enStrategy[j] }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, k);
}
```

- [ ] **Step 4: Run tests**

Run: `"$NODE/npm.cmd" --prefix web exec vitest run src/draft/cards.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/draft/cards.ts web/src/draft/cards.test.ts
git commit -m "feat(web): projectedResult + topThreats helpers"
```

### Task 4: `DraftBoard` component

**Files:**
- Create: `web/src/components/DraftBoard.tsx`
- Modify: `web/src/components/trainer.css`
- Test: `web/src/components/DraftBoard.test.tsx`

**Interfaces:**
- Consumes: `DraftModel`, `myNames`/`enemyNames`, the current `stage`, the just-locked `reveal`.
- Produces: `<DraftBoard>` rendering two panels. Props:
  ```ts
  interface DraftBoardProps {
    model: DraftModel;
    myNames: string[];
    enemyNames: string[];
    stage: 'defender' | 'attackers' | 'refusal';
  }
  ```

- [ ] **Step 1: Structure (JSX skeleton)**

Two `.board-panel`s inside a `.draft-board`:
- Panel "OUR DEFENDER · OUR MAP": defender slot (`.slot.def.mine`) showing `myNames[model.myDefender]` or `selecting…` (when `stage==='defender'`); two enemy-attacker slots (`.slot.atk.enemy`) showing `enemyNames[...]` from `model.enemyPair` once known, else `?` / "Their two attackers will land here".
- Panel "THEIR DEFENDER · THEIR MAP": defender slot (`.slot.def.enemy`) showing `enemyNames[model.enemyDefender]` or `?` (hidden until revealed); two of our attacker slots (`.slot.atk.mine`) from `model.myPair` else placeholder "Your two attackers will land here".

- [ ] **Step 2: Write a render test**

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { DraftBoard } from './DraftBoard';
import { fixtureMatrix, smoke } from '../conformance/fixtures';
import { initDraft } from '../draft/draftState';

test('shows selecting… for our defender during the defender stage', () => {
  const matrix = fixtureMatrix(smoke);
  const model = initDraft(matrix, smoke.neutralWeight);
  render(<DraftBoard model={model} myNames={matrix.myNames} enemyNames={matrix.enemyNames} stage="defender" />);
  expect(screen.getByText(/OUR DEFENDER/i)).toBeInTheDocument();
  expect(screen.getByText(/selecting/i)).toBeInTheDocument();
});
```

- [ ] **Step 3: Implement `DraftBoard.tsx`** (full component), matching mockup labels and the accent rules (mine=blue, enemy=red). Slots use `.slot.filled` when a name is present, `.slot.pending` for `selecting…`, `.slot.hidden` for `?`.

- [ ] **Step 4: Add CSS** to `trainer.css` — `.draft-board { display:flex; gap:1rem }`, `.board-panel` (card), `.board-title` (section-head style), `.slot` (bordered rows; `.def` emphasised; `.mine`/`.enemy` accent borders/text). Reuse `--card`, `--border`, `--radius-sm`.

- [ ] **Step 5: Run tests**

Run: `"$NODE/npm.cmd" --prefix web exec vitest run src/components/DraftBoard.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/DraftBoard.tsx web/src/components/DraftBoard.test.tsx web/src/components/trainer.css
git commit -m "feat(web): DraftBoard panels for the trainer (M5)"
```

### Task 5: `PhaseStepper` component

**Files:**
- Create: `web/src/components/PhaseStepper.tsx`
- Modify: `web/src/components/trainer.css`
- Test: `web/src/components/PhaseStepper.test.tsx`

**Interfaces:**
- Produces: `<PhaseStepper stage="defender" />` — a segmented `Defenders | Attackers | Refusal` indicator; the segment matching `stage` gets `.on`.

- [ ] **Step 1: Test**

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import { PhaseStepper } from './PhaseStepper';

test('marks the active stage', () => {
  render(<PhaseStepper stage="attackers" />);
  expect(screen.getByText('Attackers').className).toMatch(/on/);
  expect(screen.getByText('Defenders').className).not.toMatch(/on/);
});
```

- [ ] **Step 2: Implement** — a `.stepper` reusing the `.segmented` look; segments `[{key:'defender',label:'Defenders'}, {key:'attackers',label:'Attackers'}, {key:'refusal',label:'Refusal'}]`, active = `stage`.

- [ ] **Step 3: Run test → PASS. Commit.**

```bash
git add web/src/components/PhaseStepper.tsx web/src/components/PhaseStepper.test.tsx web/src/components/trainer.css
git commit -m "feat(web): PhaseStepper for the trainer (M5)"
```

### Task 6: `RemainingMatchups` component

**Files:**
- Create: `web/src/components/RemainingMatchups.tsx`
- Modify: `web/src/components/trainer.css`
- Test: `web/src/components/RemainingMatchups.test.tsx`

**Interfaces:**
- Produces: `<RemainingMatchups model={model} myNames enemyNames />` — a collapsible (`<details>`) `REMAINING MATCHUPS n×n` sub-matrix over `myRemaining`×`enemyRemaining` (best-map values via `toScore`, banded with `scoreBand`). Collapsed by default.

- [ ] **Step 1: Test** — renders the `n×n` summary and, when opened, one cell per remaining pair.

```tsx
test('summarises the remaining grid size', () => {
  const matrix = fixtureMatrix(smoke);
  const model = initDraft(matrix, smoke.neutralWeight);
  render(<RemainingMatchups model={model} myNames={matrix.myNames} enemyNames={matrix.enemyNames} />);
  expect(screen.getByText(new RegExp(`${model.myRemaining.length}\\s*[×x]\\s*${model.enemyRemaining.length}`))).toBeInTheDocument();
});
```

- [ ] **Step 2: Implement** — `<details className="remaining">` with `<summary>` (`section-head` + `n × n` + expand affordance) and a banded table (reuse `.why-table`/band classes).
- [ ] **Step 3: Run test → PASS. Commit.**

```bash
git add web/src/components/RemainingMatchups.tsx web/src/components/RemainingMatchups.test.tsx web/src/components/trainer.css
git commit -m "feat(web): RemainingMatchups collapsible (M5)"
```

### Task 7: Rework `WhyPanel` into EV bars + threat sub-matrix

**Files:**
- Modify: `web/src/components/WhyPanel.tsx`
- Modify: `web/src/components/trainer.css`
- Test: `web/src/components/WhyPanel.test.tsx` (create)

**Interfaces:**
- Consumes: `node: NodeResult`, `model: DraftModel`, `myNames`, `enemyNames`; `candidateStats` not needed here; uses `topThreats` + `node.choices`.
- Produces: `<WhyPanel node model myNames enemyNames />` — two sections: **TEAM EV PER … CHOICE** (ranked EV bars from `node.choices`, reuse `StrategyTable` pattern) and, when `stage==='defender'`, **SCORE VS THEIR BIGGEST THREATS** (rows = top candidate defenders, cols = `topThreats`, cells = `toScore(cells[myDef][threat].best)` banded).

- [ ] **Step 1: Test** — both headings render at the defender stage; the threats table has one column per `topThreats` entry.
- [ ] **Step 2: Implement** — replace the raw payoff matrix. EV bars: sort `node.choices` by `ev` desc, bar width scaled to the max EV span. Threat cells banded via `scoreBand(score)` → `band-*` class.
- [ ] **Step 3: Run test → PASS. Commit.**

```bash
git add web/src/components/WhyPanel.tsx web/src/components/WhyPanel.test.tsx web/src/components/trainer.css
git commit -m "feat(web): redesign WhyPanel as EV bars + threat sub-matrix (M5)"
```

### Task 8: Wire everything into `DraftTrainer`

**Files:**
- Modify: `web/src/components/DraftTrainer.tsx`
- Modify: `web/src/components/trainer.css`
- Modify: `web/src/components/DraftTrainer.test.tsx`

**Interfaces:**
- Consumes: all of Tasks 2–7.

- [ ] **Step 1: Add PhaseStepper + projected header.** Render `<PhaseStepper stage={stage} />` above the title; in `.trainer-head`, when `showHints`, append `· Projected {teamResult(projected,n).my} {delta>=0?'+':''}{delta.toFixed(1)} vs plan` using `projectedResult(model, node, expected)`.
- [ ] **Step 2: Render `<DraftBoard model … stage={stage} />`** between the controls and the choices.
- [ ] **Step 3: Replace the flat `.choices` list with the card grid.** Each `.choice` becomes a card: `.cname` + a `.cstat` line "our map · avg {avg} · floor {floor}" (from `candidateStats`; for refusal, render "our map · {avg}" since avg===floor); when `showHints`, keep the equilibrium bar + `%` + EV. Wrap in `.choices.grid`.
- [ ] **Step 4: Replace the intro `<ul>`** to restore the privacy/WTC bullet: add `<li>Runs entirely on your computer — your matrix and drafts are never uploaded. Hints are training-only and switch off during official WTC dates.</li>`.
- [ ] **Step 5: Always render the Locked pairings section** with an `{remaining} pairings remaining` placeholder when `fixed.length === 0` (remaining = `n − fixed.length`).
- [ ] **Step 6: Pass `model`/names to the reworked `WhyPanel`.**
- [ ] **Step 7: Update `DraftTrainer.test.tsx`** — the existing full-draft test still drives via `.choice` clicks (cards keep the `.choice` class), so it should pass; add an assertion that `OUR DEFENDER` board text appears mid-draft, and that the intro shows the privacy bullet.
- [ ] **Step 8: CSS** — `.choices.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(13rem,1fr)); gap:.5rem }`; `.choice` becomes a column flex card (name row, stat row, hint row); `.cstat { color:var(--text-3); font-size:.8rem }`. Add `@media (max-width:640px)` single-column + stacked board.
- [ ] **Step 9: Run typecheck + full suite**

Run:
```bash
"$NODE/npm.cmd" --prefix web run typecheck
"$NODE/npm.cmd" --prefix web test
```
Expected: clean + all green.

- [ ] **Step 10: Manual visual diff** against the mockup Trainer (board, stepper, cards, projected header, why, remaining, locked).

- [ ] **Step 11: Commit**

```bash
git add web/src/components/DraftTrainer.tsx web/src/components/DraftTrainer.test.tsx web/src/components/trainer.css
git commit -m "feat(web): rebuild trainer as the design's draft board (M5 P1)"
```

---

## PR3 — Solver layout + polish (P2/P3)

Branch: `m5-solve-polish`.

### Task 9: Solver result card split + stacked mixes

**Files:**
- Modify: `web/src/components/SolveView.tsx`
- Modify: `web/src/components/solve.css`
- Modify: `web/src/components/SolveView.test.tsx`

- [ ] **Step 1: Result card → horizontal split.** Wrap the score block and the verdict/summary block in a `.result-split` flex row: left = `.section-head` + `.big-score`; right = `.verdict` + `.muted` (sum line), right-aligned. Keep all existing text.
- [ ] **Step 2: Mixes → stacked full width.** Change `.mixes` to `display:flex; flex-direction:column; gap:1.25rem` (remove the 2-col grid); strategy bars now span full width.
- [ ] **Step 3: Update/keep `SolveView.test.tsx`** assertions (score text, both mix titles still present).
- [ ] **Step 4: Run tests → PASS.**
- [ ] **Step 5: Commit**

```bash
git add web/src/components/SolveView.tsx web/src/components/solve.css web/src/components/SolveView.test.tsx
git commit -m "feat(web): solver result split + stacked strategy mixes (M5 P2)"
```

### Task 10: Brand + tab label polish

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/theme.css`
- Modify: `web/src/App.test.tsx` (if it asserts on "Solver"/brand)

- [ ] **Step 1: Brand wordmark** → render `WTC DRAFT TRAINER` as one letter-spaced uppercase wordmark (adjust `.brand`/`.brand-mark`/`.brand-name` in `theme.css`; keep the blue accent on `WTC`).
- [ ] **Step 2: Tab label** `Solver` → `Solve` in `App.tsx` (nav button text only; the `screen` key stays `'solve'`).
- [ ] **Step 3: Fix any test** referencing the old label (search `App.test.tsx` for `/Solver/`).
- [ ] **Step 4: Run typecheck + full suite → green.**
- [ ] **Step 5: Commit**

```bash
git add web/src/App.tsx web/src/theme.css web/src/App.test.tsx
git commit -m "feat(web): brand wordmark + Solve tab label (M5 P3)"
```

---

## Self-review notes

- **Spec coverage:** fonts (Task 1); board (4), stepper (5), remaining (6), why redesign (7), cards + projected + intro bullet + locked placeholder (8, using helpers 2–3); solver split + mixes (9); brand + tab (10). All spec items map to a task.
- **Type consistency:** helper names `candidateStats` / `projectedResult` / `topThreats` and the `CandidateStats`/`Threat` shapes are used identically in Tasks 4–8.
- **No engine edits:** all reads go through `matrix.cells`, `DraftModel`, `NodeResult`, and `scale.ts` — no `engine/`, `worker/`, or `conformance/` files touched.
