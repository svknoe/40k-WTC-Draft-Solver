# CLAUDE.md

Guidance for Claude Code (and other agents) working in this repository.

## What this repo is

A **game-theoretic solver for Warhammer 40,000 WTC pairing drafts**. Two teams
of 8 players each run a structured draft (defender → two attackers → refuse
one) that decides who plays whom. Each captain rates every friendly/enemy
player matchup in advance; the solver treats the draft as **nested
standard-form games** and computes **Nash equilibrium mixed strategies** for
every decision point by backward induction. The CLI then acts as a **draft
bot**: it suggests each side's equilibrium strategy, samples a suggestion, and
lets a human train against it.

`WTC-Pairings-Visualized-2026.pdf` (repo root, untracked) illustrates the
draft process this models: both teams simultaneously reveal a defender, then
two attackers against the enemy defender, then each refuses one attacker;
repeat at 8/6/4 players; the last 4 games resolve automatically (defender vs
kept attacker ×2, refused vs refused, last vs last). Map choice follows the
11th-edition rule (PLAN.md workstream C): the defender picks the map, and
because that choice is zero-sum each matchup is rated on exactly two maps —
its best and its worst from the friendly side's perspective.

## Layout

```
drafter/
  __main__.py, app.py      entry point: python -m drafter
  common/
    draft_stage.py         DraftStage enum: none → select_defender → select_attackers → discard_attacker
    team_permutation.py    one team's partial draft state; enumeration of successor states;
                           the k-restriction heuristic (restrict to k best attackers)
    game_state.py          GameState = (draft_stage, friendly TeamPermutation, enemy TeamPermutation)
    utilities.py           direct zero-sum game solving (2x2 closed form + LP), path/key/dictionary naming
    pairing.py             PairingTables: defender-picks-the-map value lookups for one match
  data/
    initialise_dictionaries.py  reads CSVs (read_pairing_matrix), builds the SolverContext, solves
    paths.py               match-folder + cache resolution (platformdirs, issue #26)
    set_enemy_team.py      InquirerPy menu over paths.list_available_teams() (returns the name)
    read_write.py          JSON IO (used only by scripts/migrate_match_folder.py now)
  solver/
    context.py             SolverConfig (the knobs) + SolverContext (all per-run state, passed explicitly)
    game_state_dictionaries.py  enumerate reachable gamestate keys per (n, stage) -> numpy int64 arrays
    strategy_dictionaries.py    value-only backward induction; StageValues + draft strategy recompute (B3)
    games.py               build the payoff matrix for one gamestate from child values
    draft.py               interactive draft loop (uses plain input(), not InquirerPy)
    draft_loop.py          replay wrapper
  resources/matches/<Team>/    packaged read-only SAMPLE opponents (issue #26)
    pairing_matrix_best.csv    required input (see format below)
    pairing_matrix_worst.csv   required input
```

Match folders resolve from a **per-user data dir first, packaged samples
second** (`drafter/data/paths.py`, issue #26): a user's own opponents live in
`platformdirs.user_data_dir("wtc-draft-solver")/matches/<Team>/`
(`%APPDATA%\wtc-draft-solver\matches` on Windows), searched before the bundled
samples under `drafter/resources/matches/`. `ctx.paths` (a `MatchPaths`) carries
the resolved `input_dir`. There is **no disk cache** (B3, issue #13): the solve
is fast and low-RAM and is held in-process for the whole draft session.

## How it works (important for any performance work)

1. **Gamestate enumeration** (`game_state_dictionaries.enumerate_gamestates`):
   breadth-first from the full 8v8 state, storing each (n ∈ {8,6,4}, stage)
   level as a **sorted numpy int64 array of packed gamestate keys** — no
   `GameState` objects are kept (they're decoded from keys on demand), so the
   whole tree costs ~12 MB. A key is one int: friendly team code + enemy team
   code (`drafter/common/packing.py`).
2. **Value-only backward induction** (`strategy_dictionaries.initialise_values`,
   B3): iterate the stages deepest first; for each gamestate build the payoff
   matrix from its children's already-solved values (`games.build_game`) and
   solve **directly as the zero-sum game it is** for the VALUE only
   (`utilities.get_game_value` → `get_game_solution`, PLAN.md B1: saddle / 2x2
   closed form / one HiGHS LP whose dual yields the opposing strategy). Values
   are stored per stage as parallel sorted `(keys, values)` numpy arrays
   (`StageValues`, binary-search lookup) — ~8 MB, not the ~810 MB of full
   strategy vectors. Only the LP solves are memoised
   (`utilities.normalised_game_solution_cache`). The 4-player discard endgame is
   closed-form.
3. **Draft loop** (`draft.py`): walks the solved tree interactively,
   **recomputing** the labelled mixed strategy for each visited gamestate on
   demand from its children's values (`strategy_dictionaries.game_strategy`).
   The same recursion (`game_value`) transparently solves any off-tree,
   non-k-restricted subtree the user navigates into — no separate tree
   extension.

Values are read through `ctx.pairing.value(friend, enemy, defender)`
(a `PairingTables`, drafter/common/pairing.py): the best-map value when the
friendly player defends, the worst-map value when the enemy defends, and
`config.neutral_map_weight` (default 0.5 = midpoint) of the way from worst to
best when neither does (refused-vs-refused and last-players games).

**Known scale/pain points** (measured 2026-07, Ryzen 9800X3D, k as noted):

- Fresh 8-player solve was historically the "one hour, 16 GB RAM" problem
  (k=4). The cost is dominated by the ~10^5–10^6 4-player-stage gamestates.
- **B1 (done, issue #12):** every game is zero-sum, now solved directly
  (saddle / 2x2 closed form / one HiGHS LP) instead of by nashpy's
  general-bimatrix support enumeration and its degenerate-game fallback chain.
  This cut the Scotland k=3 strategy phase from ~275 s to ~29 s (≈9×) with
  bit-stable golden values and no warnings. The remaining strategy-phase cost
  is now split between the ~35k genuinely-mixed LP solves (scipy's per-call
  wrapper overhead dominates for these tiny games) and gamestate iteration.
- **B2 (done, issue #13):** packed-integer gamestate keys + an explicit
  `SolverContext` replaced the verbose string keys and module globals.
- **B3 (done, issue #13):** value-only backward induction with numpy key/value
  arrays (above) cut Scotland k=3 **peak RAM from ~1.8 GB to ~120 MB** (~15×);
  fresh solve ≈ 28 s (enumeration ~8 s, values ~20 s). The old 630 MB JSON disk
  cache is gone — the in-memory solve is fast and cheap enough not to need it.
- **B5 (decided, issue #16):** the exact (unrestricted) solve lands at ~3 min
  / <1 GB — under the ~10-min bar — so the CLI **defaults to exact**
  (`SolverConfig.restrict_attackers=False`), the true equilibrium with no
  heuristic anywhere. The k-restriction is now an opt-in **fast preview**:
  `restrict_attackers=True` restricts each select-attackers step to the
  `restricted_attackers_count` heuristically best attackers per side (heuristic:
  advantage vs defender minus average vs the rest), and `restricted_attackers_count`
  defaults to 3 (~30 s at 8 players). `python -m drafter` offers exact-vs-preview
  as a startup prompt (drafter/data/set_solve_mode.py). The restriction saturates
  from the bottom up (k≥3 → 4-player stage exact, k≥5 → 6-player, k≥7 → whole
  draft exact), so k=7 ≡ exact.

## Input format

`pairing_matrix_best.csv` and `pairing_matrix_worst.csv` (both required): the
matchup's rating on its best and worst map, from the friendly side's
perspective. Both files share one layout:

```
Friendly1,Friendly2,...,Friendly8      <- row 1: friendly player names
Enemy1,Enemy2,...,Enemy8               <- row 2: enemy player/faction names
v11,v12,...                            <- row i: friendly player i vs each enemy
...
```

Cells accept **0–20 scores** (the community scale: expected score out of 20)
or the **legacy tokens** `--, -, 0, +, ++` (= deviations from an even game
-8, -4, 0, +4, +8, so `+` is an expected 14-6 and `++` an 18-2). Both
normalise on read to the engine's internal scale, the deviation from an even
10-10 game: `internal = score - 10`, range -10..+10
(`initialise_dictionaries.parse_rating`). One deliberate quirk: a bare `0` is
the legacy token (an even matchup, 10-10), not the score 0 — write `0.0` if
you really mean a 20-0 blowout loss. Numbers outside 0–20 are rejected.

Every cell must satisfy best ≥ worst (validated on load). Friendly and enemy
names must not overlap (config.require_unique_names). The matrix is square
(8×8; 4×4 and 6×6 also work — n must be 4, 6 or 8).

Old-format folders (`pairing_matrix.csv` + optional
`map_importance_matrix.csv`) can be converted with
`scripts/migrate_match_folder.py`, which also deletes cached JSONs solved
under the old value model. Caches are guarded by a `cache_format.json`
version marker (`drafter/data/read_write.py`): caches without a current
marker are ignored on read and re-solved, so stale old-model values can never
leak into a draft. Bump `CACHE_FORMAT_VERSION` whenever the value model
changes — and in the same PR re-export the web conformance fixtures
(`scripts/export_conformance_fixtures.py`, commit the JSONs under
`web/src/conformance/fixtures/`): the TS engine (`web/`, issue #17) is pinned
against them in web CI, which deliberately does not trigger on `drafter/**`,
so stale fixtures stay silently green until re-exported.

## Running

```powershell
python -m venv .venv                 # Python 3.12
./.venv/Scripts/Activate.ps1         # or ./.venv/Scripts/activate.bat (cmd)
pip install -e ".[dev]"
python -m drafter                    # pick opponent, then exact vs fast-preview solve mode
```

`pip install -e ".[dev]"` also installs a `drafter` console script (same
entry point as `python -m drafter`), so `pipx install .` / `uvx --from .
drafter` work too.

Notes for agents:

- The InquirerPy team menu and solve-mode prompt (`set_solve_mode`) need a
  real TTY. To drive the program non-interactively, build a `SolverConfig`
  yourself (bypassing the mode prompt) and call
  `ctx = initialise_dictionaries.initialise(enemy_team_name, config)` +
  `draft_loop.play(ctx)`; the in-draft prompts are plain `input()` and accept
  piped lines (empty line = accept suggested move). See `scripts/smoke_draft.py`.
- `drafter/resources/matches/Smoke/` is a 4×4 fixture that solves in ~1 s —
  use it to verify changes end to end. `Test/` holds a near-trivial 8-player
  matrix (best = worst) useful for timing full-size solves.
- `drafter/app.py` only defines `run()`; importing it is side-effect-free.
  `drafter/__main__.py` defines `main()` (calls `app.run()`) and calls it
  under the `if __name__ == '__main__':` guard, so `python -m drafter` and
  the `drafter` console script (`drafter.__main__:main`) both go through the
  same explicit call.
- All knobs live in the frozen `SolverConfig` dataclass
  (`drafter/solver/context.py`); there are no CLI flags. Build a `SolverConfig`
  (overriding fields as needed) and pass it to `initialise()`; it and all
  per-run state travel on the explicit `SolverContext` (GitHub issue #13, B2)
  — there are no more mutable module-level globals to monkeypatch.
- The zero-sum solver is deterministic and silent: no RuntimeWarnings during
  solving (nashpy's "degenerate game" warnings are gone with nashpy, issue
  #12). scipy's `linprog` is a required dependency; nashpy and networkx are
  no longer dependencies.

## Conventions & state

- Remote: https://github.com/svknoe/40k-WTC-Draft-Solver.git, default branch `main`.
- Packaging is `pyproject.toml` (setuptools backend, pinned deps, `drafter`
  console entry point); there is no `requirements.txt` anymore. Edit
  dependency pins directly in `pyproject.toml`.
- Tests: `pytest` runs the fast golden-value suite (~15 s; the slow Scotland
  test needs `-m slow`, ~5 min). CI (`.github/workflows/ci.yml`) runs the
  smoke test + fast suite on every push/PR — keep it green; run `pytest`
  before pushing solver changes.
- Solver JSON caches now live in the platform cache dir (issue #26), not the
  repo; any stray `*.json` under `drafter/resources/matches/` is gitignored —
  never commit caches, `.venv/`, or `__pycache__/`.
- PLAN.md holds the current revival roadmap (performance, 11th-edition map
  rules, web distribution). Read it before starting substantial work.
