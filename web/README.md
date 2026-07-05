# web/ — the browser engine + trainer

The web half of the repo (docs/web-design.md §9). What's here after the
issue #17 core-tech spike:

- `src/engine/` — the TypeScript engine core: 40-bit packed gamestate keys
  (plain numbers, no BigInt), breadth-first enumeration, the k-restriction
  heuristic, 2×2 closed form + a bespoke dense simplex on `Float64Array`, and
  value-only backward induction. A port of the Python engine's B1–B3
  architecture (`drafter/solver/`), which remains the source of truth until
  the single-engine end state (PLAN.md).
- `src/worker/` — the §3 worker contract (docs/web-design.md): `solve` with
  real progress events, per-node `NodeResult` queries, `reset`.
- `src/conformance/` — fixtures exported from the Python engine
  (`scripts/export_conformance_fixtures.py`) + the vitest suite asserting the
  TS engine agrees: values to ~1e-9, exact gamestate counts, exact payoff
  matrices/labels at sample nodes, strategies as ε-equilibria (mixed
  strategies are not unique, values are).
- `bench/` + `index.html` — the in-browser benchmark harness behind the
  TS-vs-Rust/WASM decision (issue #17): runs the real worker over the
  Scotland fixture at k=3 / k=4 / exact and reports wall time + peak worker
  heap. Results and the decision live in docs/web-design.md §7.

## Commands

```powershell
npm ci             # install (Node 22+)
npm test           # fast conformance suite (Smoke, Six, Scotland k=3)
$env:CONFORMANCE_SLOW='1'; npm test   # + Scotland k=4 and exact (~minutes)
npm run typecheck
npm run dev        # serves the benchmark page
```

`prototypes/` holds throwaway validation artifacts (see its README); nothing
in it ships.
