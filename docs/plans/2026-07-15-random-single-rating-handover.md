# Handover: Random fills best/worst AND an averaged single rating per cell

Status: **planned, approved by the user, not implemented.** This document is
self-contained; read CLAUDE.md first for repo conventions (portable-node
toolchain, frozen conformance fixtures, test commands).

## Context

The Matrix editor recently gained Clear/Random buttons replacing the sample
loader (commits `b300fcd`, `809e75c`), then a follow-up (`03a9115`) made Random
mode-aware: in single-rating mode it stores one averaged value in both map
slots. **That follow-up misread the user's spec and must be replaced.**

The actual spec (user's words, confirmed): the Random button must not care
which rating option is selected. For every matchup it should

1. draw two independent integers 0–20; larger → best map, smaller → worst map
   (this part exists and is correct);
2. **also** set that matchup's *single rating* to the average of the two
   draws, as an integer — a fractional `.5` average rounds up or down with
   50/50 probability (this logic exists in `randomized()` behind its current
   `simple` flag; the flag goes away and both representations are written
   every time).

Today an `EditorCell` stores only `{ b, w }` (raw strings) and "single rating"
is just a view: the grid shows `b` in simple mode and editing collapses
`b = w`. Storing both representations requires a third per-cell value.

## User decisions (already made — do not re-ask)

- **Solve source = active mode.** Single-rating mode solves with the single
  value as both maps; best/worst mode solves with the pair. You solve what you
  see.
- **Independent layers.** Typing a single rating edits only `s`; typing
  best/worst edits only `b`/`w`. Only Random and Clear write all three.
  Switching modes never destroys data.
- Random draws are integers 0–20, two draws per cell, ordered.
- Clear resets: player names to literal `Player k` / `Opponent k`, team names
  to `''`, every cell to an even 10 (now in all three slots).

## Design

`EditorCell` becomes `{ b: string; w: string; s: string }` — `s` is the single
rating as typed (same raw-string philosophy as `b`/`w`).

- **Random** — `randomized(m, rng = Math.random)` in `web/src/model/matrix.ts`
  (drop the `simple` param added in `03a9115`): per cell draw `a`, `b`; store
  best = max, worst = min, `s` = mean; if the mean is fractional, round down
  when `rng() < 0.5`, else up (this exact logic is already in the function
  behind the flag). All three serialise via `toInputString(score - 10)`
  (`web/src/model/scale.ts:36`) so a drawn 0 stays `"0.0"` — a bare `"0"` is
  the legacy even-game token, not the score 0, and regression tests for this
  exist in `matrix.test.ts` (keep them passing).
- **Clear** — `cleared(n)`: cells `{ b: '10', w: '10', s: '10' }`.
- **Mode-aware validation** — `validateMatrix(m, simple)` in
  `web/src/model/validation.ts`: simple mode validates `s` only (parseable +
  whole number); best/worst mode validates `b`/`w` only (+ `best ≥ worst`).
  Names checked as today. The inactive layer never blocks Solve.
- **Mode-aware engine conversion** — `toEngineMatrix(m, simple)`
  (`web/src/model/matrix.ts:40`): simple mode → `best = worst = parse(s)`.
- **Backfill for old data** — new helper (e.g. `withSingle(cell)`) used by
  `fromSaved` and `parsePaste`: when `s` is missing (old localStorage, old
  exports, pasted spreadsheets) derive it: `s = b` when `b === w` (lossless for
  data authored in simple mode); else the deterministic half-up rounded average
  `Math.round((score_b + score_w) / 2)` via `toInputString` when both parse;
  else `''`. Keep the export `VERSION` at `1` — `s` is additive and backfilled
  on import, so old and new files stay mutually readable.

## File changes

**`web/src/model/matrix.ts`**
- `EditorCell` gains `s`; `empty()` → `{ b: '', w: '', s: '' }`.
- `cleared`, `randomized` per the design above.
- `transpose`: flip `s` like `b`/`w` (`toInputString(-parseRating(s))`), but
  leniently — an unparseable/blank field flips to `''` (with independent
  layers the inactive layer may legitimately be blank, and Swap sides is only
  gated on the active layer now).
- `toEngineMatrix(m, simple)` mode-aware; `fromSaved` backfills missing `s`.

**`web/src/model/validation.ts`** — `validateMatrix(m, simple)`;
`cellError(cell, simple)` checks only the active layer.

**`web/src/model/paste.ts`** — both paste shapes produce `s`: a single number
fills all three; a `best/worst` pair (or 2n-column row) backfills `s` with the
same helper. `web/src/model/paste.test.ts` exists — extend it.

**`web/src/components/Grid.tsx`** — the simple-mode input binds `cell.s`
(value, `bandClass`, onChange sets only `s`); best/worst inputs no longer
touch `s`. The "fully-blank cell isn't flagged red" check
(`Grid.tsx` ~line 66) uses the active layer.

**`web/src/components/MatrixEditor.tsx`** — Random calls
`randomized(matrix)` (no mode arg); `validateMatrix(matrix,
settings.simpleMode)`.

**`web/src/App.tsx` + `web/src/worker/useSolve.ts`** — thread
`settings.simpleMode` into the `solvable` gate (`App.tsx:44`), the
`engineMatrix` memo (`App.tsx:47`), and the solve path. `useSolve`'s
`SolveState.solve` is `(matrix: EditorMatrix, k: number | null) => void` and
converts via `toEngineMatrix(matrix)` at `useSolve.ts:49` — add a param (or
convert in App and pass the engine matrix; pick whichever ripples less).
Heads-up: `App.test.tsx` injects a fake `SolveState` (`doneSolve()`) and
`SolveView` calls `solve.solve(matrix, null)` via `onRun` in `App.tsx:162` —
a signature change touches those too.

## TDD order (repo convention: tests first, watch them fail)

1. `web/src/model/matrix.test.ts`: `randomized` reverts to `(m, rng)` and pins
   `b`/`w`/`s` per cell with deterministic rngs — including the `.5` 50/50
   rounding cases and `"0.0"` serialisation (adapt the existing
   `03a9115`-era tests: same maths, no `simple` flag);
   `cleared`/`blank`/`resize`/`transpose` cover `s`; `toEngineMatrix` both
   modes; `fromSaved` backfill (equal pair, spread pair → half-up average,
   unparseable → `''`).
2. Validation tests: mode-aware (an invalid/blank inactive layer doesn't
   block; simple mode requires whole-number `s`).
3. `paste.test.ts`: `s` on both paste shapes.
4. `MatrixEditor.test.tsx`: rewrite the `03a9115` test ("Random in
   single-rating mode stores one averaged value in both map slots") — Random
   in *either* mode stores the spread in best/worst AND the averaged integer
   in the single view; typing in single mode leaves best/worst untouched
   (flip modes to prove); typing best/worst leaves the single rating
   untouched.
5. `App.test.tsx`: should stay green (Clear yields a valid matrix in both
   modes) apart from any `solve` signature ripple.

**Untouched:** `web/src/conformance/` fixtures (frozen goldens — never edit),
`web/src/engine/`, `web/src/draft/` (they consume the engine `Matrix`, which
is unchanged).

## Verification

- From `web/` (portable node: prepend `%LOCALAPPDATA%\node-portable` to PATH):
  `npm test` and `npm run typecheck`.
- Live preview (`.claude/launch.json` has a `web-dev` config; app at
  localhost:5173): Random in best/worst mode → spreads; flip to single mode →
  integer averages of those exact pairs; type a single value, flip back → the
  pair is untouched; Solve enabled in both modes; localStorage from the
  previous build still loads (backfilled `s`). Beware: two clicks fired in one
  synchronous `javascript_exec` call don't let React re-render between them —
  use separate calls.
- Export JSON → re-import round-trips `s`; a pre-change export backfills
  sensibly.

## Housekeeping

- Commit topic by topic; do **not** push or open a PR unless the user asks.
- Commits so far on this feature: `b300fcd` (watermark rename), `809e75c`
  (prefill + Clear/Random + samples removal), `03a9115` (the misreading —
  its `simple` param and mode-aware component test get replaced by this work;
  its `"0.0"` serialisation fix and its unit-test maths carry over).
