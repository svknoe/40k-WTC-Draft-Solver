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
kept attacker ×2, refused vs refused, last vs last). Map/table choice is
currently modelled through a per-pairing "map importance" bonus for the
defending side — this is slated to change for 11th edition (see PLAN.md).

## Layout

```
drafter/
  __main__.py, app.py      entry point: python -m drafter
  common/
    draft_stage.py         DraftStage enum: none → select_defender → select_attackers → discard_attacker
    team_permutation.py    one team's partial draft state; enumeration of successor states;
                           the k-restriction heuristic (restrict to k best attackers)
    game_state.py          GameState = (draft_stage, friendly TeamPermutation, enemy TeamPermutation)
    utilities.py           nashpy game solving, pairing-value lookup, key/dictionary naming
  data/
    settings.py            all knobs (team name, k-restriction, read/write caches)
    match_info.py          module-level globals: enemy team name + input matrices
    initialise_dictionaries.py  reads CSVs, orchestrates preprocessing
    set_enemy_team.py      InquirerPy menu over drafter/resources/matches/<team>/
    read_write.py          JSON cache IO
  solver/
    game_state_dictionaries.py  enumerate all reachable gamestates per (n, stage)
    strategy_dictionaries.py    backward induction: solve every gamestate's game, deepest first
    games.py               build the payoff matrix for one gamestate from child values
    draft.py               interactive draft loop (uses plain input(), not InquirerPy)
    draft_loop.py          replay wrapper
  resources/matches/<Team>/    one folder per opponent = the "database"
    pairing_matrix.csv     required input (see format below)
    map_importance_matrix.csv  optional input
    *.json                 cached preprocessing output (gitignored, can be 100s of MB)
```

## How it works (important for any performance work)

1. **Gamestate enumeration** (`game_state_dictionaries`): starting from the
   full 8v8 state, breadth-first enumerate every reachable `GameState` for
   each (n ∈ {8,6,4}, stage) pair. States are stored in dicts keyed by
   verbose human-readable strings (`"{Defender: X}, {Attacker A: Y}, ..."`).
2. **Strategy solving** (`strategy_dictionaries`): iterate stages deepest
   first (4-player select_attackers up to 8-player none). For each gamestate
   build the payoff matrix whose entries are the already-solved values of
   child states (`games.py`), then solve that matrix game with **nashpy**
   (support enumeration → vertex enumeration → Lemke-Howson fallbacks, cached
   by matrix hash). The 4-player discard endgame is closed-form.
3. **Draft loop** (`draft.py`): walks the solved tree interactively. If the
   user makes a move outside the enumerated tree (possible with k-restriction),
   the tree is extended and re-solved on the fly.

Values are read through `utilities.get_pairing_value(n, friend, enemy,
defender)`: the raw pairing value, plus/minus a map-importance bonus scaled by
n (×1 at 8, ×0.75 at 6, ×0.5 at 4) for whichever side is defending.

**Known scale/pain points** (measured 2026-07, Ryzen 9800X3D, k as noted):

- Fresh 8-player solve is the "one hour, 16 GB RAM" problem the user reports
  (historical, k=4). The cost is dominated by the ~10^5–10^6 4-player-stage
  gamestates, each solved by nashpy support enumeration; the discrete rating
  scale makes most games degenerate, triggering slow fallbacks.
- All games here are **zero-sum**, so each could be solved by one small LP
  instead of enumeration — the main known speed lever (see PLAN.md).
- Cached JSON for one 8-player opponent ≈ 630 MB (strategy dicts dominate);
  loading that cache takes ~19 s. String keys are a large share of the RAM.
- `restricted_attackers_count` (k) in settings.py is the only current knob:
  each select-attackers step only considers the k heuristically best
  attackers per side (heuristic: advantage vs defender minus average vs
  the rest). k=4 default, k=3 for quick runs.

## Input format

`pairing_matrix.csv` (required), `map_importance_matrix.csv` (optional), both:

```
Friendly1,Friendly2,...,Friendly8      <- row 1: friendly player names
Enemy1,Enemy2,...,Enemy8               <- row 2: enemy player/faction names
v11,v12,...                            <- row i: friendly player i vs each enemy
...
```

Pairing values accept `--, -, 0, +, ++` (= -8, -4, 0, +4, +8, i.e. expected
20-0 score margin) or raw numbers. Map importance uses plain numbers.
Friendly and enemy names must not overlap (settings.require_unique_names).
The matrix is square (8×8; 4×4 and 6×6 also work — n must be 4, 6 or 8).

## Running

```powershell
python -m venv .venv                 # Python 3.12
./.venv/Scripts/Activate.ps1         # or ./.venv/Scripts/activate.bat (cmd)
pip install -r requirements.txt
python -m drafter                    # pick opponent folder from the menu
```

Notes for agents:

- The InquirerPy team menu needs a real TTY. To drive the program
  non-interactively, set `drafter.data.match_info.enemy_team_name` directly
  and call `initialise_dictionaries.initialise()` + `draft_loop.play()`;
  the in-draft prompts are plain `input()` and accept piped lines (empty
  line = accept suggested move). See `scripts/smoke_draft.py`.
- `drafter/resources/matches/Smoke/` is a 4×4 fixture that solves in ~1 s —
  use it to verify changes end to end. `Test/` holds an 8-player matrix whose
  full 630 MB cache may exist locally from old runs.
- `drafter/app.py` calls `run()` at import time (quirk: importing the module
  starts the app). `python -m drafter` works because of it, not despite it.
- Settings are plain module globals in `drafter/data/settings.py`; there are
  no CLI flags. Monkeypatch settings before `initialise()` in scripts.
- nashpy prints "degenerate game" RuntimeWarnings during solving — harmless,
  the code falls back to other algorithms.

## Conventions & state

- Remote: https://github.com/svknoe/40k-WTC-Draft-Solver.git, default branch `main`.
- No tests/CI as of 2026-07 beyond `scripts/smoke_draft.py`. No packaging
  (`requirements.txt` only). Keep `requirements.txt` UTF-8 (a PowerShell
  `pip freeze >` writes UTF-16 — avoid that).
- JSON caches under `drafter/resources/matches/` are gitignored; never commit
  them. Never commit `.venv/` or `__pycache__/`.
- PLAN.md holds the current revival roadmap (performance, 11th-edition map
  rules, web distribution). Read it before starting substantial work.
