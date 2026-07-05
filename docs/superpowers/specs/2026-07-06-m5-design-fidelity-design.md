# M5 — Design fidelity

Bring the web app (`web/`) back in line with the adopted UX source of truth,
`docs/design-mockup.html`. A second-pass review found the Matrix editor faithful,
the Solver close, and the Trainer badly diverged — plus one global regression:
the design's IBM Plex fonts are declared in CSS but never loaded, so the whole
app renders in system fallback fonts.

Delivered as three sliced PRs off `main`, in priority order. **No engine/worker
changes** — all work is `web/src/` UI + small pure helpers, so the conformance
fixtures and solver stay untouched.

## Baseline (verified against the running mockup + app)

- Mockup loads IBM Plex Sans + Mono (44 font faces); the app loads **0**
  (`document.fonts.size === 0`) despite `theme.css` naming the families.
- `DraftModel` (`web/src/draft/draftState.ts`) already tracks everything the
  draft board needs: `myDefender`, `enemyDefender`, `myPair`, `enemyPair`,
  `myRemaining`, `enemyRemaining`, `fixed`, `round`, `finalRound`.
- The mockup's card stat `avg N · floor N` = the mean and minimum of that
  defender's row over the remaining enemy pool, on the best map (the defender
  picks the map). Confirmed numerically against the sample matrix. So card
  stats are derivable from `matrix` + remaining pools with no engine change.

## PR1 — Load IBM Plex (P0)

- Add `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-mono` (weights
  400/500/600/700) to `web/package.json`; `import` them in `web/src/main.tsx`.
- Self-hosted and bundled by Vite → **zero external requests**, so the app's
  "runs entirely in your browser / nothing leaves the tab" promise stays
  literally true. A Google Fonts `<link>` is rejected for that reason.
- The CSS already references the families; this only makes them real.
- Acceptance: `document.fonts` reports IBM Plex Sans + Mono loaded; numbers
  render in the mono face.

## PR2 — Trainer rebuild (P1)

Rework `web/src/components/DraftTrainer.tsx` into the design's game-board layout.
New components live under `web/src/components/`; new logic as pure, unit-tested
helpers under `web/src/draft/`.

### DraftBoard (new component)
Two panels shown during an active round:
- **OUR DEFENDER · OUR MAP** — our defender (blue) + two incoming enemy-attacker
  slots (red).
- **THEIR DEFENDER · THEIR MAP** — their defender (red) + two of our outgoing
  attacker slots (blue).

Slots fill from `DraftModel` (`myDefender`/`enemyDefender`/`myPair`/`enemyPair`)
plus the just-locked reveal. Pending picks show `selecting…`; hidden (not yet
revealed) enemy picks show `?`. "OUR MAP"/"THEIR MAP" are conceptual labels
(no named maps exist in the data).

### PhaseStepper (new component)
`Defenders | Attackers | Refusal` segmented indicator; the current stage
(`node.stage`) is active.

### Choice cards (replace the flat `.choices` list)
Responsive card grid. Each card: faction name + a **map-based stat line**
(`our map · avg · floor`) always visible, plus the equilibrium bar + % + EV
when hints are on. New pure helper `candidateStats(model, node, choiceIndex)`
→ `{ avg, floor }` over the relevant remaining pool, per stage:
- **defender**: my score across enemy remaining, best map (I defend).
- **attackers**: the pair's score against their defender, worst map (they
  defend the game I attack into).
- **refusal**: the kept matchup value (my defender vs the enemy attacker I keep).

Bands reuse `scoreBand` (`web/src/model/scale.ts`).

### Round header — projected vs plan
Add the design's `Projected N +Δ vs plan` beside `Round X / Y`. New pure helper
`projectedResult(model, node, expected)` → `{ projected, delta }`: achieved
(sum of `fixed`) + the current node's best-EV continuation, compared to the
solver's pre-draft `expected`. Shown only when hints are on.

### WhyPanel redesign (keep the concept, match the design)
Replace the raw full payoff matrix with two parts:
- **TEAM EV PER DEFENDER CHOICE** — ranked EV bars from `node.choices`.
- **SCORE VS THEIR BIGGEST THREATS** — a small sub-matrix: our top candidates
  (rows) × the enemy's top-3 threats (columns). "Threats" = enemy remaining
  players ranked by equilibrium weight (`node.why.enStrategy`), tie-broken by
  average strength against our remaining pool. New pure helper
  `topThreats(model, node, k=3)`.

### RemainingMatchups (new component)
Collapsible `REMAINING MATCHUPS n×n` showing the shrinking sub-matrix from
`myRemaining`/`enemyRemaining` (best-map values, banded). Collapsed by default.

### Locked pairings
Render the section (with an `n pairings remaining` placeholder) from round 1,
not only once `fixed.length > 0`.

## PR3 — Solver layout + polish (P2/P3)

- `web/src/components/SolveView.tsx` + `solve.css`: result card → horizontal
  split (big score left; verdict + "sum of n games · 20n total" right).
- Strategy mixes → full-width **stacked** cards (long bars), replacing the
  2-column grid.
- `web/src/App.tsx` + `theme.css`: brand wordmark → `WTC DRAFT TRAINER`; tab
  label `Solve` (not `Solver`).
- Restore the trainer-intro privacy/WTC-lock bullet ("Runs entirely on your
  computer … hints switch off during official WTC dates").

## Testing

- Vitest unit tests for every new pure helper: `candidateStats`,
  `projectedResult`, `topThreats`.
- Component render tests for `DraftBoard`, `PhaseStepper`, the reworked cards,
  and `RemainingMatchups`; extend `web/src/components/DraftTrainer.test.tsx`.
- `npm run typecheck` + full `vitest` green before each PR.
- Manual visual diff against the mockup via two preview servers (app on 5173,
  mockup on 8080).

## Non-goals

- No engine, worker, solver, or conformance-fixture changes.
- No new map data model (maps stay implicit in best/worst values).
- No editor changes (it's already faithful).
