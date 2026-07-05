# Web trainer — architecture addendum (issue #18)

**Status:** draft for review (issue #18) · **Date:** 2026-07-05

> **Companion prototype:** a runnable, dependency-free mock of the §3 worker contract
> lives at [`web/prototypes/contract-mock.html`](../web/prototypes/contract-mock.html).
> It is throwaway validation that the protocol round-trips — **not** the shipped app.

> This document is the *engineering* half of issue #18. The *UX* half is already
> answered — completely — by the Claude Design artifact
> (`WTC Draft Trainer(1).html`). This addendum deliberately does **not** re-describe
> the screens; it adopts the artifact as the visual/interaction source of truth and
> specifies only what a visual mockup cannot: the UI↔engine seam, the data formats,
> the validation rules, and the decisions we are deliberately deferring.
>
> It is written to be **independent of the two open decisions** — the compute-engine
> language (TS vs Rust→WASM, gated on M3 / issue #17) and the frontend framework
> (React vs Svelte). Nothing here changes based on either.

---

## 1. Relationship to the design artifact

| Question | Answered by |
|---|---|
| What does it look like? Screens, layout, flow, colours, copy | **The artifact** (adopt as-is, by reference) |
| How is it actually built? Worker seam, data contracts, persistence format, validation, slicing | **This doc** |

The artifact is a **throwaway prototype**: its "Solve" is a scripted progress bar, its
bot is a greedy `argmax` heuristic, and everything runs on the main thread. Those are
placeholders. This doc records the *real* architecture that replaces them, and — most
importantly — the **stub→real mapping** (§5) so the intent survives when the prototype
is rebuilt for production.

What the artifact *does* correctly encode, and we keep:
- Four screens: **Matrix editor → Solve view → Draft trainer → Draft summary**.
- Draft state machine: `defender → attackers → refusal → done`, over rounds at
  8/6/4 players, last 4 games auto-resolving.
- The **value model** (matches PLAN.md workstream C): `best` map value when the friendly
  side defends, `worst` when the enemy defends, midpoint `(best+worst)/2` for neutral
  games (refused-vs-refused, last players).
- Bot "styles" (equilibrium / greedy / wildcard), colourblind toggle, undo stack,
  localStorage saves, JSON import/export, paste-from-spreadsheet, simple/advanced mode.

---

## 2. Architecture at a glance

Fully static, client-side, no backend (privacy is mandatory — pairing matrices are
competitive secrets and must never leave the browser; this also makes free static
hosting possible). Hosting: **GitHub Pages** (repo already there; Cloudflare Pages is
the drop-in upgrade if ever needed).

```
┌─────────────────────────── Browser tab ───────────────────────────┐
│                                                                    │
│  UI thread (framework: React|Svelte — TBD)                         │
│   ├─ Matrix editor        ├─ Draft trainer     ├─ Draft summary    │
│   ├─ Solve view           └─ Why panel                             │
│   │                                                                │
│   │   postMessage(request)          postMessage(event|result)      │
│   ▼                                        ▲                       │
│  ┌──────────────── Web Worker (engine: TS|WASM — TBD) ─────────┐   │
│  │  solve()  → enumerate + backward induction (LP per game)    │   │
│  │  holds solved values in memory; answers per-node queries    │   │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  localStorage  ◄──── persist() / restore()   (never leaves tab)    │
└────────────────────────────────────────────────────────────────────┘
```

The **Web Worker boundary is the whole point**: the UI framework and the engine
language are chosen independently, because they only ever exchange plain
(structured-clone-able) JSON messages. Either side can be built against a mock of the
other.

---

## 3. The engine ⟷ UI contract (worker message protocol)

All messages are plain JSON objects with a `type` discriminator and a `reqId` to
correlate responses. Versioned with `protocol: 1`.

### 3.1 Requests (UI → worker)

```ts
// Run the full solve for the current matrix. Long-running → emits progress.
{ type: 'solve', reqId, protocol: 1,
  matrix: Matrix,           // see §4.1 — best/worst per cell, internal scale
  k: number | null }        // k-restriction (null = exact; M3/#5 decides default)

// Query one draft node (instant; served from the solved values held in the worker).
{ type: 'node', reqId, path: Move[] }   // path from root; [] = opening node

// Discard the solved state (matrix edited → results invalid).
{ type: 'reset', reqId }
```

`Move` identifies a decision made walking the tree (which side, stage, chosen
index/indices), enough for the worker to locate the gamestate. Exact encoding is an
engine-internal detail; the UI treats `path` as an opaque list it appends to.

### 3.2 Responses & events (worker → UI)

```ts
// During solve():
{ type: 'progress', reqId, frac: number,     // 0..1 — drives the REAL progress bar
  phase: string }                            // e.g. 'enumerating' | 'inducting'

// solve() completed:
{ type: 'solved', reqId,
  expected: number,                          // equilibrium expected team result (internal scale)
  root: NodeResult }                         // opening-defender node (see below)

// node() response:
{ type: 'nodeResult', reqId, node: NodeResult }

{ type: 'error', reqId, code: string, message: string }
```

### 3.3 `NodeResult` — the per-node payload the trainer + Why panel consume

This is the shape the UI already expects (the mockup's `{cands, evs, probs, names,
_pairData}`), restated with **real** semantics:

```ts
type NodeResult = {
  stage: 'defender' | 'attackers' | 'refusal' | 'done',
  side: 'my' | 'enemy' | 'simultaneous',
  round: 1 | 2 | 3,

  // The candidate choices at this node (single index for defender/refusal;
  // pairs for attackers).
  choices: Array<{
    id: number | [number, number],   // player index, or attacker pair
    name: string | [string, string],
    prob: number,                     // ← EQUILIBRIUM mixed-strategy weight (LP), NOT softmax(ev)
    ev: number                        // ← continuation value if this choice is taken
                                      //   (backward-induction value, internal scale)
  }>,

  // "Why" panel: the payoff matrix at this node (child values), so the panel can
  // show WHERE the ev comes from. Recomputed on demand from stored values (B3).
  why: {
    rowLabels: string[], colLabels: string[],
    payoff: number[][],               // internal scale
    myStrategy: number[], enStrategy: number[]  // equilibrium mixes over rows/cols
  } | null
}
```

**Bot styles stay in the UI.** `equilibrium` = sample from `choices[].prob`;
`greedy` = pick `argmax(prob)`; `wildcard` = temperature-flattened sample. These are
pure client-side transforms of the returned strategy — the engine only ever returns
the true equilibrium. (In the mockup these live in `sample()`; they stay there.)

### 3.4 Solve view payload

The Solve view shows the expected team result + opening-defender mixed strategy for
both sides — i.e. `expected` + `root.choices` (my side) plus the enemy's root strategy.
`solved.root` carries the friendly opening node; the enemy opening mix is included as
`root.why.enStrategy` (both sides' opening put-up is one simultaneous matrix game).

---

## 4. Data formats

### 4.1 In-memory matrix (what crosses the worker boundary)

```ts
type Matrix = {
  n: 4 | 6 | 8,
  myNames: string[], enemyNames: string[],   // length n, disjoint
  cells: { best: number, worst: number }[][] // n×n, INTERNAL scale (score − 10, −10..+10)
}
```

Conversion between the community 0–20 scale (all human-facing surfaces) and the
internal deviation scale (`internal = score − 10`) happens in the **UI presentation
layer only**, exactly as in the Python engine. The worker speaks internal scale.

### 4.2 localStorage (from the artifact — this is the current shape)

Key `wtcDraftTrainer`:
```jsonc
{
  "cb": false,               // colourblind mode
  "simpleModeV2": true,      // simple/advanced toggle (note: field-rename versioning)
  "saves": { "<name>": <SavedMatrix>, ... },
  "current": {               // the working matrix (auto-restored on load)
    "myTeam": "Norway", "enemyTeam": "Scotland",
    "myNames": [...], "enemyNames": [...],
    "cells": [[{ "b": "12", "w": "9" }, ...], ...]   // strings (as typed), 0–20 scale
  }
}
```
Note: the artifact stores cells as **0–20 strings** (raw editor input). Normalisation to
numbers + internal scale happens on solve, not on save. Keep it that way (round-trips
losslessly, tolerates in-progress/invalid edits).

### 4.3 Export/import file (JSON only for MVP)

**Decided (2026-07-05): JSON-only for the MVP.** CSV interop is deferred.
- **Native JSON export** — a `SavedMatrix` (the `current` block above) plus a
  `"format": "wtc-matrix", "version": 1` header. Human-portable, re-importable.
- **Deferred (post-MVP):** round-trip with the repo's `pairing_matrix_best.csv` +
  `pairing_matrix_worst.csv` so captains can move a matrix between the CLI and the web
  app. Nice-to-have; not required for the train-against-the-bot MVP. Revisit if users ask.

---

## 5. Stub → real engine mapping (the crux)

| Concern | Artifact (throwaway) | Real engine (this contract) |
|---|---|---|
| Where compute runs | main thread | **Web Worker** |
| Progress bar | scripted `setInterval` + canned messages | **real `progress` events** (`frac`, `phase`) |
| Node values (`ev`) | greedy `argmax` simulation (`simAll`/`evDef`…) | **backward-induction values** |
| Strategy (`prob`) | `softmax(evs)` heuristic | **Nash mixed strategy from the LP** |
| Why panel | approximate | real payoff matrix (child values) + equilibrium mixes |
| Bot styles | client-side sampling of a heuristic | client-side sampling of the **true** strategy (unchanged) |
| Value model | best/worst/midpoint ✓ | best/worst/midpoint ✓ (already correct — keep) |

The UI's data *shapes* barely change; its *source* changes from "compute inline with a
heuristic" to "await a message from the worker." This is why Slices 1–3 can be built
against a **mock worker** that returns the heuristic (or canned) `NodeResult`s, with the
real engine dropped in behind the same contract at Slice 2.

---

## 6. Validation rules (mirror the CLI; run in the UI before `solve`)

- Every cell: `best ≥ worst` (reject otherwise).
- Cells accept **0–20 numbers** or legacy tokens `--,-,0,+,++`. A bare `0` is the legacy
  *even* token (10–10), **not** the score 0 — write `0.0` for a 20–0 blowout loss.
  Numbers outside 0–20 are rejected.
- Friendly and enemy names disjoint and non-empty.
- Square matrix; `n ∈ {4, 6, 8}`.
- Validation is a UI concern (immediate inline feedback, as the artifact already does);
  the worker assumes a clean `Matrix`.

---

## 7. Deferred decisions & open questions

| Decision | Status | Trigger / owner |
|---|---|---|
| **Compute-engine language** (TS vs Rust→WASM) | **Deferred** | After M3 lands; issue #17 spike measures TS-in-browser against real profile numbers. **Benchmark at the target k (4, ideally 5) — not just k=3** — since that's what decides whether TS suffices or Rust→WASM is needed (§7.1). Default TS; Rust→WASM is the escape hatch behind the same contract. Pyodide = dev-only oracle. |
| **Frontend framework** (React vs Svelte) | **Open, low-stakes** | Decide at Slice 1. Artifact is React (continuity); Claude Design can re-emit in Svelte if chosen. Does not affect this contract. |
| **Hosting** | **Settled** | GitHub Pages; Cloudflare Pages as upgrade. |
| **Repo layout** | **Settled (2026-07-05): `web/` subdir of this repo** | Monorepo — see §9. Deploy = Action builds `web/`, base path `/40k-WTC-Draft-Solver/`, `.nojekyll`. |
| **CSV interop** | **Settled (2026-07-05): deferred** | MVP is JSON-only (§4.3). CSV round-trip revisited post-MVP if asked. |
| **k (attacker restriction)** | **MVP: k=3 · target: k=4 · stretch: k=5** | k = number of best attackers considered per side (**not** team size). See §7.1 — the main pressure on the engine choice. |

### 7.1 The k / engine performance ladder

`k` (the attacker-restriction, `restricted_attackers_count`) is the dominant cost lever:
the gamestate count fans out **~4× per k-increment** at each select-attackers stage, and
the 4-player stages already dominate the tree. So:

- **k=3 — MVP.** Smallest tree; the interactive target that must "feel like seconds."
  Ship the trainer here first.
- **k=4 — the real goal.** Today ~15 min / ~2 GB in *native* Python (pre-M3). Only
  realistic in a browser tab **after** M3's B2/B3 cut RAM to tens of MB and B1 drops
  solve time to seconds.
- **k=5 — stretch.** Several × heavier again; likely needs both the full M3 wins **and**
  the fast (Rust→WASM) engine. Treat as "if we get it fast enough," not a commitment.

Implication for issue #17: the spike must benchmark the **TS engine at k=4 (and probe
k=5)**, not just k=3 — passing at k=3 says nothing about whether TS clears the real goal.
This is the concrete trigger that would flip the engine choice from TS to Rust→WASM.

---

## 8. How this slices (issues #19 / #20 / #21)

- **#19 Matrix editor** — needs §4 (formats) + §6 (validation). **No engine.** Fully
  buildable now once the framework is picked; can ship to Pages behind a beta flag.
- **#20 Solve + strategy tables** — needs §3 (contract) + §5. Built against a **mock
  worker** first; real engine dropped in when M3 + #17 land.
- **#21 Full trainer** — needs the full `NodeResult` (§3.3) incl. the Why panel.

Everything in §3–§6 is decidable and buildable-against-a-mock **now**; only the engine
*implementation* waits on M3, and only the *framework* waits on a preference call.

---

## 9. Repo layout (decided 2026-07-05)

The web app lives in a **`web/` subdirectory of this repo** (monorepo), not a separate
repo. Rationale: the TS port must stay in lockstep with the Python engine's rules and be
validated against conformance fixtures generated from it, so one source of truth, one
issue tracker/milestone set (M4 is already here), and atomic cross-cutting changes win.
A separate repo would only pay off if the web app became its own product with its own
contributors — not the case for a solo maintainer.

```
40k-WTC-Draft-Solver/
├─ drafter/                     # existing Python package (untouched)
├─ docs/web-design.md           # this addendum, migrated from scratchpad
├─ web/                         # the web app (self-contained)
│  ├─ package.json, vite config, src/, ...
│  └─ (node_modules/, dist/ — gitignored)
└─ .github/workflows/
   ├─ ci.yml                    # existing Python CI (unchanged)
   └─ deploy-pages.yml          # new: build web/ → publish to Pages
```

Deploy implications (all standard):
- The Pages Action builds inside `web/` and publishes its `dist/`.
- Vite `base` = `/40k-WTC-Draft-Solver/` (project-site path), or `/` behind a custom domain.
- Add an empty `.nojekyll` to the published output.
- Add `web/node_modules/` and `web/dist/` to `.gitignore`.
- Python CI and the Pages deploy are independent jobs; neither blocks the other.
