# Revival plan (2026-07)

Roadmap for bringing the WTC draft solver back to life. Four workstreams:
**A** foundation, **B** performance/RAM, **C** 11th-edition map model,
**D** distribution. Sequencing at the bottom.

## Where we are (baseline, measured 2026-07-03)

The 2024 breakage is fixed (a mass-rename introduced a module-shadowing bug
that crashed every fresh solve; see
https://github.com/svknoe/40k-WTC-Draft-Solver/pull/5). Verified working
again end to end. Baseline numbers on a Ryzen 9800X3D, Scotland 8×8 matrix:

| Metric | k=3 fresh solve | full cache load (k=4-era) |
|---|---|---|
| Gamestate enumeration | 16 s, 1.55M states | 13 s |
| Strategy solving | 275 s (~950k games solved) | 6 s |
| Total | ~5 min | ~19 s |
| Peak RAM | ~2 GB | — |
| Cache size on disk | — | ~630 MB JSON |

Historical report: k=4 fresh solve ≈ 1 h / 16 GB on older hardware. State
count fans out ~4× per k increment at each select-attackers stage, so that is
consistent. The 4-player stages dominate everything (705k of the 1.55M states
at k=3).

## A. Foundation (small, do first)

Goal: never lose a week to "it silently broke" again.

1. **Golden-value tests.** The top-level game value for a fixed matrix is a
   single number that exercises the whole pipeline (Scotland k=3 →
   `6.189614…`; plus Smoke 4-player exact values). Assert them in a test.
2. **CI.** GitHub Actions on push: install requirements, run
   `scripts/smoke_draft.py` + golden tests on the Smoke/4-player path
   (seconds, free). The 2024 regression would have been caught on the day it
   was pushed.
3. **Packaging hygiene.** `pyproject.toml` with pinned deps (replaces
   requirements.txt), `python -m drafter` unchanged. Optional: publish so
   `pipx install` / `uvx` works — the cheapest distribution improvement that
   exists (workstream D0).

Effort: S. No design decisions.

## B. Performance & RAM (the core enabler)

Diagnosis from the baseline run — the cost is **not** inherent to the math:

- Every game here is **zero-sum**, but is solved with nashpy's
  *support enumeration* (exponential in matrix size, built for general
  bimatrix games), and the discrete rating scale (-8/-4/0/+4/+8) makes most
  games degenerate, triggering nashpy's slow fallback chain
  (support → vertex → Lemke-Howson). A zero-sum game is one small LP —
  or closed form for the ~850k 2×2 games in the tree.
- States are keyed by verbose strings (`"{Defender: X}, {Attacker A: …"`),
  built by string formatting, parsed back by regex, stored in dicts of Python
  objects, and serialized to 630 MB of JSON. Both RAM numbers and the cache
  are mostly *names*.
- Full mixed-strategy vectors are stored for every state, but during a draft
  only the ~20 states actually visited need strategies.

Plan, in order, each step measurable against the golden tests:

1. **B1 — solve zero-sum games directly.** 2×2 closed form; larger matrices
   via one `scipy.optimize.linprog` (HiGHS) call; keep the matrix-hash cache.
   Deterministic, no degenerate-game warnings. Expected: strategy phase drops
   from minutes to seconds.
2. **B2 — integer state encoding.** A team permutation is
   (defender, attacker_A, attacker_B, discarded, remaining-bitmask) over ≤8
   players → packs into one 32-bit int; a gamestate is two ints. Values live
   in `dict[int64] → float` or numpy arrays. Names only exist at the
   presentation layer. Expected: RAM ~2 GB → tens of MB at k=3; caches shrink
   accordingly (or become unnecessary). This step also retires the
   module-level globals (`match_info`, mutable `settings`) in favour of an
   explicit solver-context object passed around — a from-scratch rebuild of
   the idea behind the abandoned 2024 "store" refactor (branches deleted
   2026-07; recoverable from GitHub PR refs if ever needed).
3. **B3 — value-only backward induction.** Persist/propagate only game
   *values*; recompute the mixed strategy on demand for the state currently
   shown in the draft loop (one LP, instant). Kills the 271 MB strategy
   dictionaries entirely and most of the write/read time.
4. **B4 — parallelism, if still needed.** Each stage's games are independent;
   `multiprocessing` over 16 threads is a further ~10×.
5. **B5 — decide the fate of the k-heuristic.** k-restriction is an
   *approximation* (it can miss equilibrium attackers), not just a speed
   knob. After B1–B4, measure the unrestricted 8-player solve (~30–100× the
   k=4 tree). If it lands under ~10 min in Python, default to exact and keep
   k as a "fast preview" option; if not, this is the point to consider a
   Rust core (which workstream D may want anyway).

Rewriting in a faster language *first* would be premature: the algorithmic
fixes (B1–B3) are language-independent and likely sufficient for the CLI, and
they define the small portable core that D needs. Effort: M (B1–B3), each
step landable separately.

## C. 11th-edition map model (decided 2026-07)

Rule change to model: for every pairing the possible missions/maps are known
in advance and **the defender picks the map** (1 of 3). Because map choice is
zero-sum, the middle map is never picked in practice: whoever defends takes
the map best for themselves, which is the worst for the opponent. So captains
rate each matchup on exactly **two** maps — the pairing's best and worst from
the friendly side's perspective.

- **Inputs:** `pairing_matrix_best.csv` + `pairing_matrix_worst.csv`
  (same shape as today). Replaces `map_importance_matrix.csv`.
- **Value function** (the only engine change — `get_pairing_value`):
  - friendly player defends → best-map value;
  - enemy defends → worst-map value;
  - neither defends (refused-vs-refused game, last-players game) → midpoint,
    as a 50/50 model of who ends up with map advantage. Make this a setting.
- **Remove** the old map-importance path and its n-scaled multiplier
  (0.5/0.75/1.0) — the new model needs no free parameters.
- **Rating-scale convention (decided 2026-07):** the engine keeps the
  internal symmetric margin scale (-8…+8; zero-sum math and verdicts stay
  clean), but every human-facing surface — website above all — speaks the
  community's 0–20 language: a matchup reads "15 / 12" (expected score out
  of 20 on best map / worst map), a team result reads "83 – 77". Conversion
  is affine (score = 10 + margin/2) and lives strictly in the presentation
  layer. CSV inputs should accept 0–20 numbers (and the legacy --/-/0/+/++
  tokens) and normalise on read.
- Note: the WTC 2026 in-person procedure (see PDF) is a shared pool of 8
  tables with a table-choice token alternating between teams. Modelling the
  pool exactly would multiply the state space by table-subsets; the
  best/worst approximation keeps the tree unchanged and captures the
  first-order effect (defender advantage). Revisit only if drafts show it
  matters.

Structurally independent of B (it's a ~50-line change either way), but do it
after A so golden tests pin everything else. Effort: S–M (mostly data-format
migration of existing match folders + README).

## D. Distribution ("send the team a link")

Target: captains enter/import their matrix in a browser, hit solve, then
train against the bot — no clone, no Python. One hard requirement discovered
in the data: **pairing matrices are competitive secrets**. Teams will not
upload honest ratings to someone's server. That decides the architecture:

- **D1 — static, fully client-side web app** (recommended):
  - Solver core compiled for the browser. Decide after B lands, informed by
    real profile numbers:
    - *TypeScript port* — after B1–B3 the core is small (bitmask states +
      tiny LPs + one backward pass; the current whole package is ~1,650
      lines). Simplest toolchain.
    - *Rust → WASM* — fastest, and the same crate can back a native CLI;
      right choice if B5 shows exact solves need more headroom.
    - *Pyodide* — zero rewrite, ~15 MB download, slowest; fine as a
      throwaway prototype only.
  - Runs in a web worker with a progress bar; k=4 must feel interactive
    (seconds), exact mode can take minutes with progress.
  - UI: matrix grid editor with paste-from-spreadsheet, name rows/columns,
    validation; draft trainer mirroring the CLI (suggested strategies with
    probabilities, sampled bot moves, back/undo, final score vs expected);
    a "why" panel showing the payoff matrix at the current node would be a
    genuinely new capability for training captains.
  - Persistence: localStorage + explicit JSON export/import. No accounts, no
    backend, host free on GitHub Pages. Privacy is a selling point.
- **D0 — stopgap now:** pipx/uvx installability (workstream A3) + README.
- **D2 — later, only if demanded:** team workspaces/sharing → would need a
  backend; defer until real users ask.

Effort: M–L (the UI is the bulk). Depends on B for the portable core and on
C for the current-edition rules being in that core.

## Sequencing (agreed 2026-07)

```
M0 (done)  Restore + benchmarks + docs
M1         Foundation: merge to main, golden tests, CI, pyproject
M2         11th edition: best/worst map model + data migration
           (before the rewrite, so golden tests pin the final rules)
M3         Speedup: B1 LP → B2 states/context → B3 value-only → B4 parallel
           → B5 exact-mode decision; small backend fixes ride along
M4         Web: core-tech spike (TS vs WASM) + short design doc,
           then vertical slices published to GitHub Pages from the first PR:
           matrix editor → solve + strategy tables → full trainer
```

Web MVP scope (decided 2026-07): **full train-against-the-bot**, shipped in
the slices above.

## Process

Status is tracked on GitHub: milestones M1–M4 with one issue per step —
https://github.com/svknoe/40k-WTC-Draft-Solver/milestones

Work happens as GitHub issues + PRs against a stable `main`:

- one issue per plan step, with acceptance criteria (golden values, timing,
  RAM); milestones M1–M4 group them;
- one PR per step, CI must be green — nothing bigger than one plan step per
  PR, so no refactor can strand half-finished again;
- PLAN.md stays the direction document (ordering + decisions, updated when a
  decision changes); GitHub is the status tracker — status is not duplicated
  here.

## Non-goals (for now)

- **5-player teams:** deliberately deferred indefinitely (decided 2026-07).
  The engine stays 4/6/8-per-side; a 5-player draft has a different stage
  graph and gets its own workstream if it ever becomes relevant.
- **Exact WTC table-pool modelling:** the best/worst two-map model above is
  the agreed approximation; neutral games (refused-vs-refused, last players)
  use the 50/50 midpoint unless drafts show it matters.
