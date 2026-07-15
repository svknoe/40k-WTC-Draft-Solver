# Team sizes 3–8 (odd-size draft support)

Extend the TS engine and trainer to every team size 3–8. Today the engine
supports 4/6/8 (the even track designed for 8); this adds the odd track
(5 → 3, 7 → 5 → 3, and 3 alone) as **one parity-aware rule, not a parallel
codebase**: only the terminal round differs between the two tracks.

Decided up front (2026-07-15): TS-only — the Python engine was removed first
(tag `v-final-pre-python-removal`); all sizes 3–8 are in scope, not just 5;
the frozen conformance fixtures keep pinning 4/6/8 and are not regenerated.

## The odd-size draft flow (confirmed with the user for 5)

- Every non-terminal round is **identical** to the even track: simultaneous
  defender reveal → each side picks an unordered pair of attackers against
  the enemy defender → each side refuses one; two games lock (each defender
  vs the kept attacker), the refused attackers return to the pools, n drops
  by 2.
- The terminal round happens at **n = 3** (instead of n = 4): each side
  reveals a defender; the other two players are automatically the attackers
  (C(2,2) = 1 — the existing pair enumeration already produces this as a
  1×1 "game", no special case); each side refuses one. That locks defender
  vs kept attacker ×2 plus **refused vs refused**. There is **no
  last-vs-last game** — defender + 2 attackers is the whole team, the
  remaining mask is empty.
- A 5-player draft is therefore 2 + 3 = 5 games over 2 rounds; 7 players =
  7 games over 3 rounds; 3 players = 3 games over 1 round.

## Engine (`web/src/engine/engine.ts`)

One derived constant drives everything: `endgameN = n % 2 === 1 ? 3 : 4`.
Replace each hardcoded even-track boundary with it:

- `enumerate`: `totalLevels = 3 * ((n - endgameN) / 2 + 1)`; the stop
  condition becomes `levelN === endgameN && stage === 'select_attackers'`.
- `induct`: the stage order loop starts at `endgameN`
  (`for (levelN = endgameN; levelN <= n; levelN += 2)`).
- `discardGameValue` and `buildDiscardGame`: the closed-form branch triggers
  at `levelN === endgameN` (equivalently `popcount8(mask) + 3 === endgameN`).
  The last-vs-last term generalises to
  `lastTerm = mask === 0 ? 0 : neutral[fLast * n + eLast]` — the odd endgame
  is the even endgame minus that term. All four AA/AB/BA/BB cells otherwise
  unchanged.
- `nodeResult`: the `done` check and the round arithmetic use `endgameN`;
  `round = (n - currentN) / 2 + 1` already yields the right numbers for odd
  sizes. The `round` type stays `1 | 2 | 3` (7 players peaks at 3 rounds,
  same as 8).
- `childCount`: no change — `pairCount(2) = 1` already handles the forced
  n=3 attacker pair, for both exact and k-restricted solves.

`packing.ts` (8-bit masks, 4-bit roles) and `restriction.ts` (heuristic over
whatever remaining list it is given) need **no changes**.

## Model layer (`web/src/model/`)

- `matrix.ts`: `MatrixSize` widens from `4 | 6 | 8` to `3 | 4 | 5 | 6 | 7 | 8`;
  `isSize` / `assertSize` (and its "must be 4, 6, or 8" message) follow. The
  generic helpers (`blank`, `resize`, `transpose`, `toEngineMatrix`) are
  size-agnostic already.
- `paste.ts` / `validation.ts` / `exchange.ts`: wherever the size whitelist
  or its error message surfaces, accept 3–8. Parsing/validation logic itself
  is size-generic.
- `samples.ts`: the Template generator takes any `MatrixSize`; add one real
  5×5 sample so the odd track is one click away in the UI.

## Trainer logic + UI (`web/src/draft/`, `web/src/components/`)

- `draftState.ts`: `finalRound` becomes `(n - endgameN) / 2 + 1` (today
  `(n - 4) / 2 + 1`); in the final-round resolution the `last`-kind game is
  emitted only when a last player exists (remaining pools non-empty). The
  refused-vs-refused game is unchanged.
- `summary.ts` / `cards.ts`: already size-generic (game lists and card stats
  derive from the model); verify via tests rather than rewrite.
- Components: the Matrix editor's size selector offers 3–8; the final-round
  "auto-paired this round" board panel and the draft summary render the odd
  endgame without a last-players row. Round/stepper labels derive from
  `finalRound` and need no structural change.
- `worker/`: passes `n` through opaquely — no change expected.

## Testing

- **Frozen goldens untouched**: the existing conformance fixtures keep
  pinning the 4/6/8 value model; they are never regenerated (the exporter is
  gone with the Python engine).
- **Naive reference solver** (new, test-only:
  `web/src/engine/reference.ts`, imported only by tests): a plain recursive,
  memoised solve over object states — no packing, no key arrays, no level
  enumeration — sharing only `zeroSum.ts`. It independently re-derives game
  values for small matrices; engine vs reference asserted to ~1e-9 for 3×3,
  4×4, and 5×5 matrices (validates enumeration, induction, packing, and the
  odd endgame; 4×4 also cross-checks the reference itself against the frozen
  Smoke fixture).
- **Hand-computed 3-player case**: a tiny matrix whose 3×3 defender game and
  2×2 refusal endgame are workable by hand; asserts the exact value and that
  the odd endgame omits the last-vs-last term.
- **ε-equilibrium node checks** for a 5-player draft path end to end
  (defender → attackers → refusal → 3-player terminal round → done),
  including `nodeResult` round numbers and the forced 1×1 attacker stage.
- **Model/UI tests**: `isSize` accepts 3–8; paste/validation of a 5×5
  matrix; `draftState` final-round resolution for n=5 (5 games, no `last`
  game) and n=4 (unchanged: 4 games incl. `last`).

## Out of scope

- Team sizes above 8 (packing headroom exists but masks/UI assume ≤8) or
  below 3.
- Mixed-size drafts, alternate refusal rules, or captain-places-last-pairing
  variants.
- Regenerating or extending the frozen conformance fixtures.
