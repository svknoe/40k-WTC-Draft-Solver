"""Regression test for the discard_attacker child-key wiring (issue #32).

The n=6/8 discard game's off-diagonal entries must return the REFUSED
attackers to the child pools, not the attackers who just played. The golden
tests would catch a regression only as an unexplained value shift; this test
pins the wiring itself, cell by cell, with sentinel child values.

In-process like test_map_model.py: a SolverContext is built with the test
pairing tables and get_game_strategy is stubbed to capture the payoff matrix,
so no solver or global state is involved.
"""
import pytest

import drafter.common.utilities as utilities
import drafter.solver.games as games
import drafter.solver.context as context
from drafter.common.pairing import PairingTables
from drafter.common.draft_stage import DraftStage
from drafter.common.game_state import GameState
from drafter.common.team_permutation import TeamPermutation


def make_ctx(best, worst):
    return context.SolverContext(
        config=context.SolverConfig(),
        enemy_team_name="Test",
        pairing=PairingTables(best, worst, 0.5),
        restriction=None,
        gamestate_dictionaries={},
        strategy_dictionaries={},
        game_solution_caches=games.make_game_solution_caches())


def child_key(remaining_friends, extra_friend, remaining_enemies, extra_enemy):
    return GameState(
        DraftStage.none,
        TeamPermutation(remaining_friends + [extra_friend]),
        TeamPermutation(remaining_enemies + [extra_enemy]),
    ).get_key()


def test_discard_attacker_returns_refused_attackers_to_child_pools(monkeypatch):
    # 6-player state, mid-draft: defenders picked, attackers presented.
    # Names chosen already-sorted so TeamPermutation's attacker sorting is a
    # no-op and fA/eA keep their roles.
    f_defender, f_attacker_A, f_attacker_B = "Fdef", "FattA", "FattB"
    remaining_friends = ["Frem1", "Frem2", "Frem3"]
    e_defender, e_attacker_A, e_attacker_B = "Edef", "EattA", "EattB"
    remaining_enemies = ["Erem1", "Erem2", "Erem3"]

    # Distinct pairing values so each fixed-pairing term is identifiable:
    # the friendly defender defends (best map), the enemy defender forces the
    # worst map. PairingTables.value reads both dictionaries for every pairing,
    # so the side not selected is filled with a sentinel that would blow up
    # the expected matrix if it ever leaked in.
    best = {
        f_defender: {e_attacker_A: 1.0, e_attacker_B: 2.0},
        f_attacker_A: {e_defender: -99.0}, f_attacker_B: {e_defender: -99.0}}
    worst = {
        f_defender: {e_attacker_A: -99.0, e_attacker_B: -99.0},
        f_attacker_A: {e_defender: 10.0}, f_attacker_B: {e_defender: 20.0}}
    ctx = make_ctx(best, worst)

    # Sentinel child-game values, one per (returned friend, returned enemy).
    sentinels = {
        child_key(remaining_friends, f_attacker_A, remaining_enemies, e_attacker_A): 1000.0,
        child_key(remaining_friends, f_attacker_B, remaining_enemies, e_attacker_A): 2000.0,
        child_key(remaining_friends, f_attacker_A, remaining_enemies, e_attacker_B): 3000.0,
        child_key(remaining_friends, f_attacker_B, remaining_enemies, e_attacker_B): 4000.0,
    }
    select_defender_strategies = {key: [None, None, value] for key, value in sentinels.items()}

    captured = {}

    def capture_game_strategy(cache, game_array, friendly_options, enemy_options):
        captured["array"] = game_array
        return "stub"

    monkeypatch.setattr(utilities, "get_game_strategy", capture_game_strategy)

    gamestate = GameState(
        DraftStage.select_attackers,
        TeamPermutation(remaining_friends, f_defender, f_attacker_A, f_attacker_B),
        TeamPermutation(remaining_enemies, e_defender, e_attacker_A, e_attacker_B),
    )

    assert games.discard_attacker(ctx, 6, gamestate, select_defender_strategies) == "stub"

    # Row = enemy attacker the friendly side refuses, column = friendly
    # attacker the enemy side refuses. In each cell the KEPT attackers play
    # the defenders and the REFUSED pair is returned to the child pools.
    fD_eA, fD_eB = 1.0, 2.0
    fA_eD, fB_eD = 10.0, 20.0
    expected = [
        # refuse eA / they refuse fA: eB plays fD, fB plays eD, child gets (fA, eA)
        [fD_eB + fB_eD + 1000.0, fD_eB + fA_eD + 2000.0],
        [fD_eA + fB_eD + 3000.0, fD_eA + fA_eD + 4000.0],
    ]
    assert captured["array"].tolist() == expected
