# CLAUDE.md

Guidance for Claude Code (and other agents) working in this repository.

## What this repo is

A **game-theoretic solver for Warhammer 40,000 WTC pairing drafts**, shipped
as a fully client-side **React + TypeScript web app** (GitHub Pages:
https://svknoe.github.io/40k-WTC-Draft-Solver/). Two teams run a structured
draft (simultaneous defender reveal → two attackers against the enemy
defender → each side refuses one; refused attackers return to the pools;
repeat until the endgame round resolves the last games automatically). Each
captain rates every friendly/enemy matchup in advance; the engine treats the
draft as **nested zero-sum standard-form games** and computes **Nash
equilibrium mixed strategies** for every decision point by backward
induction. The app then acts as a **draft trainer**: it suggests each side's
equilibrium strategy, samples bot moves, and lets a human train against it.

Map choice follows the 11th-edition rule: the defender picks the map, and
because that choice is zero-sum each matchup is rated on exactly two maps —
its best and its worst from the friendly side's perspective. Values are read
as: best-map value when the friendly player defends, worst-map value when the
enemy defends, and a neutral weight (default 0.5 = midpoint) of the way from
worst to best when neither does (refused-vs-refused and last-players games).

**History:** the engine began life in Python with a CLI (`python -m
drafter`). The TypeScript port (issue #17) became the sole implementation in
2026-07; the Python code was removed and is preserved at the git tag
`v-final-pre-python-removal`. PLAN.md is the (largely completed) revival
roadmap from that era — historical context, not current work.

## Layout

All code is under `web/` (see `web/README.md` for the module map):

```
web/src/
  engine/        the solver core: packing.ts (40-bit gamestate keys),
                 engine.ts (enumeration + value-only backward induction +
                 on-demand node strategies), zeroSum.ts (2x2 closed form +
                 dense simplex LP), restriction.ts (k-restriction heuristic)
  worker/        web-worker contract + typed client + useSolve React hook
  conformance/   frozen golden fixtures (exported from the retired Python
                 engine) + the vitest suite pinning values/counts/strategies
  model/         matrix editing: 0-20 <-> internal scale, validation, paste,
                 localStorage, JSON export/import, samples, WTC-date lock
  draft/         trainer logic: bot styles, draft loop, regret decomposition
  components/    the four screens (Matrix -> Solve -> Draft -> Summary)
docs/web-design.md   the design document (worker contract, conformance, UX)
```

## How the engine works (important for any solver change)

1. **Gamestate enumeration** (`engine.ts` `enumerate`): breadth-first from
   the full-team root, storing each (n, stage) level as a sorted deduped
   `Float64Array` of packed keys — no objects; decoded on demand. Stages
   cycle none → select_defender → select_attackers (the discard level is
   pass-through: its game is decided at the parent select_attackers state).
   Each refusal round removes 2 players per side; the endgame round (n=4)
   resolves in closed form (defender vs kept attacker ×2, refused vs refused,
   last vs last).
2. **Value-only backward induction** (`induct`): deepest stage first, build
   each gamestate's payoff matrix from its children's already-solved values
   and solve it directly as the zero-sum game it is (saddle / 2×2 closed form
   / one simplex LP). Values live in parallel sorted (keys, values) arrays
   with binary-search lookup.
3. **Draft-time node queries** (`nodeResult`): walk a move path from the
   root, recompute the labelled mixed strategy for the reached gamestate on
   demand from child values; the same recursion transparently solves any
   off-tree (non-k-restricted) subtree and memoises it.

The **exact solve is the default** (true equilibrium, no heuristic; an 8×8
solve is seconds in TS). The k-restriction (`restriction.ts`) is an opt-in
fast preview: restrict each select-attackers step to the k heuristically best
attackers per side (advantage vs defender minus average vs the field). It
saturates from the bottom up, so k=7 ≡ exact for 8 players.

## Input format

Matrices are entered in the app (editor, paste, JSON import, samples). Team
sizes 3–8 are supported (odd sizes end at a 3-player terminal round with no
last-vs-last game). Cells accept **0–20 scores** (community scale: expected
score out of 20), where `10` is an even 10-10 game, `0` is a 20-0 blowout
loss, and `20` is a 20-0 win. Internally everything normalises to the
deviation from an even 10-10 game (`internal = score - 10`, range -10..+10).
Every cell must satisfy best ≥ worst. Each player's name is a faction picked
from a dropdown (the 28 WTC factions) or left as the positional `Player N` /
`Opponent K` default; two players on the **same** team can't share a faction,
but both teams may field the same one. (The legacy relative tokens
`--, -, 0, +, ++` were retired in favour of the plain 0–20 scale — `0` now
means the score 0, not an even game.)

## Running & testing

Node 22+. From `web/`:

```powershell
npm ci             # install
npm test           # fast conformance + app suite (Smoke, Six, Scotland k=3)
$env:CONFORMANCE_SLOW='1'; npm test   # + Scotland k=4 and exact solves
npm run typecheck
npm run dev        # app at http://localhost:5173/
npm run build      # production build -> dist/ (deployed to Pages)
```

## Conventions & state

- Remote: https://github.com/svknoe/40k-WTC-Draft-Solver.git, default branch
  `main`.
- CI: `.github/workflows/web-ci.yml` (typecheck + full conformance suite,
  triggers on `web/**`) and `deploy-pages.yml` (builds `web/` and publishes
  to Pages on pushes to main touching `web/**`). Keep web CI green; run
  `npm test` and `npm run typecheck` before pushing engine changes.
- The conformance fixtures (`web/src/conformance/fixtures/*.json`) are
  **frozen goldens** — never edit or regenerate them; they pin the
  4/6/8-player value model. New behavior gets new tests alongside them.
- Never commit `node_modules/` or `web/dist/`.
- `docs/design-mockup.html` is the UX reference for the trainer screens.
