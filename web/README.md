# web/ — the browser trainer

The web half of the repo (docs/web-design.md §9): a fully client-side
**React + TypeScript** app that ports the WTC draft solver to the browser and
runs the whole train-against-the-bot flow with nothing leaving the tab. Live on
GitHub Pages at https://svknoe.github.io/40k-WTC-Draft-Solver/ (base
`/40k-WTC-Draft-Solver/`).

- `index.html` + `src/main.tsx` + `src/App.tsx` — the app shell and screen nav
  (Matrix editor → Solve view → Draft trainer → Draft summary).
- `src/engine/` — the TypeScript engine core (issue #17): 40-bit packed
  gamestate keys (plain numbers, no BigInt), breadth-first enumeration, the
  k-restriction heuristic, 2×2 closed form + a bespoke dense simplex on
  `Float64Array`, and value-only backward induction. Originally a port of the
  retired Python engine's B1–B3 architecture (preserved at the git tag
  `v-final-pre-python-removal`); now the sole implementation.
- `src/worker/` — the §3 worker contract (`worker.ts`) plus a typed
  `WorkerClient` and the `useSolve` React hook the UI talks through.
- `src/conformance/` — frozen golden fixtures (exported from the retired
  Python engine) + the vitest suite asserting the TS engine agrees: values to
  ~1e-9, exact gamestate counts, exact payoff matrices/labels at sample nodes,
  strategies as ε-equilibria. Pins the 4/6/8-player value model against
  drift; runs in web CI on every push.
- `src/model/` — matrix editing: 0-20 ↔ internal scale, validation, paste,
  localStorage, JSON export/import, sample matrices, and the WTC-date lock.
- `src/draft/` — the trainer's client-side logic: bot styles, the draft loop
  (path/pairing reconstruction), and the regret/variance decomposition.
- `src/components/` — the four screens plus shared pieces.

## Commands

```powershell
npm ci             # install (Node 22+)
npm test           # fast conformance + app suite (Smoke, Six, Scotland k=3)
$env:CONFORMANCE_SLOW='1'; npm test   # + Scotland k=4 and exact
npm run typecheck
npm run dev        # serves the app at http://localhost:5173/
npm run build      # production build -> dist/ (deployed to Pages)
```

`prototypes/` holds throwaway validation artifacts (see its README); nothing
in it ships.
