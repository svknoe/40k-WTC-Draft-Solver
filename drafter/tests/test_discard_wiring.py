"""Regression test for the discard_attacker child-key wiring (issue #32).

The n=6/8 discard game's off-diagonal entries must return the REFUSED
attackers to the child pools, not the attackers who just played. The golden
tests would catch a regression only as an unexplained value shift; this test
pins the wiring itself, cell by cell, with sentinel child values.

In-process (post-B2, GitHub issue #13): players are integer indices, pairing
values are index-keyed numpy arrays on a SolverContext, and get_game_strategy
is stubbed to capture the payoff matrix -- no solver or global state involved.
"""
import numpy as np
import pytest

import drafter.common.utilities as utilities
import drafter.solver.games as games
import drafter.solver.context as context
from drafter.common.pairing import PairingTables
from drafter.common.draft_stage import DraftStage
from drafter.common.game_state import GameState
from drafter.common.team_permutation import TeamPermutation


def make_ctx(best, worst):
    friendly = context.NameIndex.from_names(["f{}".format(i) for i in range(best.shape[0])])
    enemy = context.NameIndex.from_names(["e{}".format(i) for i in range(best.shape[1])])
    return context.SolverContext(
        config=context.SolverConfig(),
        enemy_team_name="Test",
        friendly=friendly,
        enemy=enemy,
        pairing=PairingTables(best, worst, 0.5),
        restriction=None,
        paths=None,
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
    # 6-player state, mid-draft: defenders picked, attackers presented. Indices
    # per side: defender 0, attacker_A 1, attacker_B 2, remaining 3/4/5.
    f_defender, f_attacker_A, f_attacker_B = 0, 1, 2
    remaining_friends = [3, 4, 5]
    e_defender, e_attacker_A, e_attacker_B = 0, 1, 2
    remaining_enemies = [3, 4, 5]

    # Distinct pairing values so each fixed-pairing term is identifiable: the
    # friendly defender defends (best map), the enemy defender forces the worst
    # map. Every other cell is a sentinel that would blow up the expected matrix
    # if the wrong map or pairing ever leaked in.
    best = np.full((6, 6), -99.0)
    worst = np.full((6, 6), -99.0)
    best[f_defender, e_attacker_A] = 1.0
    best[f_defender, e_attacker_B] = 2.0
    worst[f_attacker_A, e_defender] = 10.0
    worst[f_attacker_B, e_defender] = 20.0
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

    # Row = enemy attacker the friendly side refuses, column = friendly attacker
    # the enemy side refuses. In each cell the KEPT attackers play the defenders
    # and the REFUSED pair is returned to the child pools.
    fD_eA, fD_eB = 1.0, 2.0
    fA_eD, fB_eD = 10.0, 20.0
    expected = [
        # refuse eA / they refuse fA: eB plays fD, fB plays eD, child gets (fA, eA)
        [fD_eB + fB_eD + 1000.0, fD_eB + fA_eD + 2000.0],
        [fD_eA + fB_eD + 3000.0, fD_eA + fA_eD + 4000.0],
    ]
    assert captured["array"].tolist() == expected
