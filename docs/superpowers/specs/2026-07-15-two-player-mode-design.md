# Two-player ("both sides") trainer mode

Add a second trainer mode where one person makes the draft picks for **both**
teams — for solo study or rehearsing a real upcoming draft from both seats —
alongside the existing play-vs-bot mode. Toggled like the "Single rating /
Best-worst map" toggle, placed left of the Hints toggle.

Decided up front (2026-07-15, brainstormed with the user): the mode is for one
person playing both sides (no hot-seat secrecy or pass-the-device handling);
each stage shows **two choice panels with one Lock**; the opponent panel uses
the **opponent's own perspective**; the summary scores **both seats**; the mode
is **fixed per draft**.

## Interaction model

- Every draft stage (defender / attackers / refusal) stays one screen with one
  Lock. In two-player mode the choices area splits into two labelled panels —
  the friendly team's cards (unchanged) and the opponent's cards (new) — and
  Lock enables only once both sides have a complete pick. Locking applies both
  moves simultaneously, exactly as `applyStep` already works: it takes the
  friendly choice index plus an enemy **column index**; the bot mode samples
  that column from `node.why.enStrategy`, the two-player mode has the human
  choose it. There is **no sampling anywhere** in a two-player draft.
- Opponent panel per stage, cards rendered in engine column order
  (`node.why.colLabels`), so the selection index *is* the column index:
  - **defender**: their remaining players;
  - **attackers**: individual attacker toggles (pick 2) like the friendly
    side, resolved to a column via the pair→column mapping;
  - **refusal**: framed symmetrically as "whom *their* defender faces" among
    my two sent attackers (the card names the kept one; the other is refused).
- **Perspective**: everything on the opponent panel reads from the opponent's
  own view, so "higher is better" holds within each panel: their expected
  score is `20 − yours`, their mix is `enStrategy`, their EV for column j is
  `−Σᵢ myStrategy[i]·payoff[i][j]`.
- **Auto pick** fills both panels (each side sampled from its own equilibrium
  mix). **Undo** is unchanged: one step = both picks. The board's pending
  highlights extend to show the opponent's in-progress picks (slots that are
  hidden-until-reveal in bot mode fill live in two-player mode).

## The toggle

- Topbar, left of Hints: `Opponent: bot` / `Opponent: you`. Also rendered on
  the intro screen (the mode must be chosen before starting).
- **Fixed per draft**: disabled while a draft is live, like the Matrix tab
  locks — a draft is purely one mode, so the summary decomposition is always
  well-defined. Component state like Hints (not persisted to localStorage).
- Hints and the WTC-date lock apply to both panels; the lock disables hints
  only, never the mode itself.

## Decision log & summary

- In two-player mode `applyStep` also records an opponent `DraftDecision`
  (chosen/best EV and regret computed from the payoff columns, negated to the
  opponent's perspective; names from `colLabels`, with the refusal faced-name
  mirroring).
- The end-of-draft summary scores both seats: each team's total regret and
  worst leaks. There is **no variance line** — with no sampling,
  `achieved − expected ≡ opponent regret − your regret`, which the copy states
  directly. Bot-mode drafts keep today's summary untouched.

## Out of scope

- Hot-seat play between two humans (concealment, hand-over screens).
- Switching mode mid-draft (bot "takes over" a two-player draft or vice
  versa).
- Persisting the mode choice across sessions.
- Any engine or worker change — the solve, node queries, and conformance
  fixtures are untouched; this is a draft-layer + UI feature.
