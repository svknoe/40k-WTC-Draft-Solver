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
settings.restricted_attackers_count / settings.restrict_attackers; relying on
the settings.py defaults would let a future default change silently shift
these numbers.

Runtime budget: every test in this file except test_scotland_8_player_k3 is
part of the fast suite (each a few seconds, dominated by Python subprocess
startup + a small solve). test_scotland_8_player_k3 is marked `slow` and
takes about 5 minutes; it is deselected by default (see pytest.ini) and must
be run explicitly:

    .venv\\Scripts\\python.exe -m pytest -m slow

nashpy prints "degenerate game" RuntimeWarnings to stderr during solving on
these fixtures -- expected given the discrete rating scale (see CLAUDE.md),
and harmless. They are not asserted on either way.
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
# games solved by scipy linprog instead of nashpy) which reproduced the value
# to 1e-15 and the same friendly strategy; see the issue #9 PR for the run
# outputs.
# The value is a plain float; strategy probabilities are nashpy's own
# `round(..., 3)` output (see drafter/common/utilities.py get_game_strategy),
# so 1e-9 tolerance is appropriate there too.

SMOKE_K = 4
SMOKE_EXPECTED_VALUE = 4.997553182223153
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
# (get_pairing_value) is exercised. Measured fresh-solve time (k=4, this
# repo's Ryzen 9800X3D-class dev box, cold Python start included): ~12s.
# Comfortably under the ~30s CI-friendly target from the issue.
#
# Value re-pinned for the best/worst map model (issue #9): 3 bit-identical
# fresh solves via scripts/compute_golden_value.py Six 4.

SIX_K = 4
SIX_EXPECTED_VALUE = 1.5140341559225499


def test_six_player_top_level_value():
    result = solve_fixture("Six", SIX_K, timeout=60)
    assert result["n"] == 6
    assert result["value"] == pytest.approx(SIX_EXPECTED_VALUE, abs=1e-9)


# --- Scotland: 8-player fixture, k=3 (drafter/resources/matches/Scotland).
# Slow (~5 minutes on this repo's dev box per PLAN.md baseline) -- deselected
# by default (see pytest.ini's `addopts = -m "not slow"`). Run explicitly:
#     .venv\\Scripts\\python.exe -m pytest -m slow
#
# The full-precision value was re-pinned for the best/worst map model
# (issue #9) via two bit-identical fresh solves of
# scripts/compute_golden_value.py Scotland 3 (~4.5 min each on this repo's
# dev box); see the issue #9 PR for the raw run output.
#
# Only the value is pinned exactly. The top-level strategy *support sets*
# (which players get non-negligible probability) are pinned as sets, but the
# exact probabilities are not -- support enumeration over an 8-player
# top-level game can return different (but equally valid) equilibria/orderings
# depending on nashpy's internal enumeration order, while the *value* of a
# zero-sum game's equilibria is unique and stable. The support sets below have
# been identical across independent fresh solves (2026-07, post-#9 re-pin:
# both top-level strategies are pure under the new model).

SCOTLAND_K = 3
SCOTLAND_EXPECTED_VALUE = 6.348743764113647
SCOTLAND_EXPECTED_FRIENDLY_SUPPORT = frozenset({"Petter"})
SCOTLAND_EXPECTED_ENEMY_SUPPORT = frozenset({"Drukhari"})


@pytest.mark.slow
def test_scotland_8_player_k3():
    result = solve_fixture("Scotland", SCOTLAND_K, timeout=900)
    assert result["n"] == 8
    assert result["value"] == pytest.approx(SCOTLAND_EXPECTED_VALUE, abs=1e-6)
    assert support_set(result["friendly"]) == SCOTLAND_EXPECTED_FRIENDLY_SUPPORT
    assert support_set(result["enemy"]) == SCOTLAND_EXPECTED_ENEMY_SUPPORT
