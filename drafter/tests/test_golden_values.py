"""Golden-value tests (GitHub issue #6 / PLAN.md step A1).

Pin end-to-end correctness with exact expected values so later changes (the
11th-edition map model, the LP solver rewrite, integer state encoding -- see
PLAN.md workstreams B and C) can be verified against a known-good baseline.
If any of these tests fail after a change, either the change introduced a
regression, or the golden values below need to be deliberately recomputed and
updated (see scripts/compute_golden_value.py).

Isolation: every test solves its fixture in a fresh subprocess -- see
drafter/tests/conftest.py and drafter/tests/_solve_fixture.py for why.

k is pinned explicitly in every call below. Golden values depend on
SolverConfig.restricted_attackers_count / restrict_attackers; relying on the
SolverConfig defaults would let a future default change silently shift these
numbers.

Runtime budget: every test in this file except test_scotland_8_player_k3 is
part of the fast suite (each a few seconds, dominated by Python subprocess
startup + a small solve). test_scotland_8_player_k3 is marked `slow` and
takes about 5 minutes; it is deselected by default (see pytest.ini) and must
be run explicitly:

    .venv\\Scripts\\python.exe -m pytest -m slow

The direct zero-sum solver (issue #12: saddle / 2x2 closed form / one HiGHS LP)
is deterministic and silent -- unlike nashpy, it emits no "degenerate game"
RuntimeWarnings -- so a clean stderr is one of that issue's acceptance criteria.
"""
import pytest

from drafter.tests.conftest import solve_fixture, strategy_probabilities, support_set


# --- Smoke: 4-player fixture (drafter/resources/matches/Smoke) ---
#
# Values below were re-pinned for the 11th-edition best/worst map model
# (issue #9) by running this exact test's solve 3 times
# (scripts/compute_golden_value.py Smoke 4) and confirming bit-identical
# results each time, and additionally cross-checked against an independent
# brute-force implementation (explicit 4-player draft enumeration, zero-sum
# games solved by scipy linprog) which reproduced the value to 1e-15 and the
# same friendly strategy; see the issue #9 PR for the run outputs. The engine
# now also solves via LP/closed form (issue #12), and this test still passes
# bit-for-bit -- an equilibrium value is unique, so replacing the solver leaves
# it unchanged.
# The value is a plain float; strategy probabilities are the solver's output
# rounded to 3 decimals (see drafter/common/utilities.py get_game_strategy),
# so 1e-9 tolerance is appropriate there too.
#
# Deviation-scale correction (issue #30): value deliberately UNCHANGED. The
# parse fix (score-10 instead of 2*(score-10)) halves parsed values, and the
# fixture re-migration (score = 10 + pairing +/- importance instead of
# 10 + (pairing +/- importance)/2) doubles the file notation; no Smoke cell
# clamps, so the internal values -- and this pin -- are bit-identical.
# Re-verified: 3x bit-identical fresh solves + the independent brute force.
#
# discard_attacker child-key fix (issue #32): UNCHANGED again, provably --
# the bug lived in the n=6/8 recursion; a 4-player draft only uses the
# closed-form endgame. Re-verified 3x bit-identical.

SMOKE_K = 4
# Exact repr of the current engine's value (was 4.997553182223153, 1 ulp off:
# the B1 LP solver shifted the last bit but the pin was only re-verified at the
# 1e-9 tolerance below, not bit-exactly). Cross-platform float noise keeps the
# tolerance; the literal now matches a fresh solve.
SMOKE_EXPECTED_VALUE = 4.997553182223154
SMOKE_EXPECTED_FRIENDLY_PROBS = [0.293, 0.0, 0.691, 0.015]  # Alice, Bob, Carol, Dave
SMOKE_EXPECTED_ENEMY_PROBS = [0.047, 0.0, 0.513, 0.439]  # Chaos, Eldar, Ork, Tau


def test_smoke_4_player_top_level_value():
    result = solve_fixture("Smoke", SMOKE_K, timeout=60)
    assert result["n"] == 4
    assert result["value"] == pytest.approx(SMOKE_EXPECTED_VALUE, abs=1e-9)


def test_smoke_4_player_top_level_strategies():
    result = solve_fixture("Smoke", SMOKE_K, timeout=60)

    friendly_names = [entry[0] for entry in result["friendly"]]
    enemy_names = [entry[0] for entry in result["enemy"]]
    assert friendly_names == ["Alice", "Bob", "Carol", "Dave"]
    assert enemy_names == ["Chaos", "Eldar", "Ork", "Tau"]

    friendly_probs = strategy_probabilities(result["friendly"])
    enemy_probs = strategy_probabilities(result["enemy"])

    assert friendly_probs == pytest.approx(SMOKE_EXPECTED_FRIENDLY_PROBS, abs=1e-9)
    assert enemy_probs == pytest.approx(SMOKE_EXPECTED_ENEMY_PROBS, abs=1e-9)


# --- Six: 6-player fixture (drafter/resources/matches/Six), created for the
# golden-test issue. Values not all symmetric/zero, and its best/worst
# matrices differ per cell so the defender-picks-the-map code path
# (PairingTables.value) is exercised. Measured fresh-solve time (k=4, this
# repo's Ryzen 9800X3D-class dev box, cold Python start included): ~12s.
# Comfortably under the ~30s CI-friendly target from the issue.
#
# Value re-pinned for the discard_attacker child-key fix (issue #32): 3
# bit-identical fresh solves via scripts/compute_golden_value.py Six 4, and
# cross-checked against the independent scripts/brute_force_oracle.py
# (explicit recursion + scipy linprog): oracle 1.9058104884743514 on the
# unrestricted tree, fixed engine 1.9058104884743512 unrestricted AND at k=4
# (the k-heuristic does not bind on this fixture) -- 1 ulp agreement, same
# top-level mix (Cleo 0.103 / Elin 0.897). Previous pins: 1.5140341559225499
# (issues #9/#30, encoding the pre-#32 child-key bug).

SIX_K = 4
# Exact repr of the current engine's value (was 1.9058104884743512, 2 ulp off
# for the same B1-LP reason as SMOKE above); tolerance kept for cross-platform.
SIX_EXPECTED_VALUE = 1.9058104884743532


def test_six_player_top_level_value():
    result = solve_fixture("Six", SIX_K, timeout=60)
    assert result["n"] == 6
    assert result["value"] == pytest.approx(SIX_EXPECTED_VALUE, abs=1e-9)


# --- Scotland: 8-player fixture, k=3 (drafter/resources/matches/Scotland).
# Slow (~5 minutes on this repo's dev box per PLAN.md baseline) -- deselected
# by default (see pytest.ini's `addopts = -m "not slow"`). Run explicitly:
#     .venv\\Scripts\\python.exe -m pytest -m slow
#
# The full-precision value was re-pinned for the discard_attacker child-key
# fix (issue #32) via two bit-identical fresh solves of
# scripts/compute_golden_value.py Scotland 3 (~4.5 min each on this repo's
# dev box); see the issue #32 PR for the raw run output. The fix moved the
# value from 6.348743764113647 (pinned in #9, unchanged by #30) and flipped
# the friendly defender equilibrium from pure Petter to pure Mariusz -- the
# bug had double-counted kept attackers, inflating continuations.
#
# Only the value is pinned exactly. The top-level strategy *support sets*
# (which players get non-negligible probability) are pinned as sets, but the
# exact probabilities are not -- a zero-sum game can have several equally-valid
# equilibria, and which one a solver returns (nashpy's enumeration order, or the
# vertex an LP lands on) is not part of the contract, while the *value* of those
# equilibria is unique and stable. The support sets below have been identical
# across independent fresh solves (2026-07, post-#32 re-pin: both top-level
# strategies are pure).

SCOTLAND_K = 3
SCOTLAND_EXPECTED_VALUE = 5.875946490218083
SCOTLAND_EXPECTED_FRIENDLY_SUPPORT = frozenset({"Mariusz"})
SCOTLAND_EXPECTED_ENEMY_SUPPORT = frozenset({"Drukhari"})


@pytest.mark.slow
def test_scotland_8_player_k3():
    result = solve_fixture("Scotland", SCOTLAND_K, timeout=900)
    assert result["n"] == 8
    assert result["value"] == pytest.approx(SCOTLAND_EXPECTED_VALUE, abs=1e-6)
    assert support_set(result["friendly"]) == SCOTLAND_EXPECTED_FRIENDLY_SUPPORT
    assert support_set(result["enemy"]) == SCOTLAND_EXPECTED_ENEMY_SUPPORT
