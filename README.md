# 40k-WTC-Draft-Solver

Computes optimal strategies for Warhammer 40,000 WTC pairing drafts using
game-theoretic Nash equilibria — and lets you train against them.

**Use it in the browser:** https://svknoe.github.io/40k-WTC-Draft-Solver/

The app is fully client-side (React + TypeScript): enter your team's pairing
matrix, solve the draft to the true equilibrium, then run practice drafts
against the bot. Nothing leaves the tab.

## How it models the draft

Both captains rate every friendly-vs-enemy matchup in advance as a **0–20
expected score** on the pairing's **best** and **worst** map (11th edition:
the defender picks the map, so only those two ever get played). The draft —
simultaneous defender reveal, two attackers against the enemy defender, each
side refuses one, repeat — is treated as nested zero-sum standard-form games
and solved exactly by backward induction. Every suggestion the trainer makes
is an equilibrium mixed strategy.

## Repository layout

All code lives in [web/](web/README.md) — the engine, the trainer UI, and
the test suites. `docs/web-design.md` is the design document.

The original Python engine and CLI were retired in 2026-07 once the
TypeScript port became the sole implementation; they are preserved at the git
tag `v-final-pre-python-removal`. The conformance fixtures it exported remain
in `web/src/conformance/fixtures/` as frozen goldens pinning the value model.

## Development

```powershell
cd web
npm ci             # install (Node 22+)
npm test           # fast conformance + app suite
npm run dev        # serves the app at http://localhost:5173/
```

See [web/README.md](web/README.md) for the full command list and module map.
