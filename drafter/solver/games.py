import numpy as np  # standard libraries

import drafter.common.utilities as utilities  # local source
import drafter.common.game_state as game_state
from drafter.common.game_state import GameState
from drafter.common.team_permutation import TeamPermutation
from drafter.common.draft_stage import DraftStage
from drafter.common.pairing import Defender

STAGES = ("select_defender", "select_attackers", "discard_attacker")


def make_game_solution_caches():
    # One matrix-hash cache per (draft stage, n). Content-keyed memoisation of
    # solved zero-sum games; lives on the SolverContext instead of module-level
    # globals (GitHub issue #13).
    return {stage: {4: {}, 6: {}, 8: {}} for stage in STAGES}


def select_defender(ctx, n, none_gamestate, select_attackers_strategies):
    gamestate_matrix = game_state.get_next_gamestate_matrix(ctx, none_gamestate)
    friendly_team_options = [row[0].friendly_team_permutation.defender for row in gamestate_matrix]
    enemy_team_options = [_gamestate.enemy_team_permutation.defender for _gamestate in gamestate_matrix[0]]
    game_array = get_game_array(gamestate_matrix, select_attackers_strategies)
    select_defender_strategy = utilities.get_game_strategy(ctx.game_solution_caches["select_defender"][n],
        game_array, friendly_team_options, enemy_team_options)

    return select_defender_strategy


def select_attackers(ctx, n, selected_defender_gamestate, discard_attacker_strategies):
    gamestate_matrix = game_state.get_next_gamestate_matrix(ctx, selected_defender_gamestate)

    friendly_team_options = [[row[0].friendly_team_permutation.attacker_A,
        row[0].friendly_team_permutation.attacker_B] for row in gamestate_matrix]

    enemy_team_options = [[gamestate.enemy_team_permutation.attacker_A,
        gamestate.enemy_team_permutation.attacker_B] for gamestate in gamestate_matrix[0]]  # TODO ?

    game_array = get_game_array(gamestate_matrix, discard_attacker_strategies)

    select_attackers_strategy = utilities.get_game_strategy(ctx.game_solution_caches["select_attackers"][n],
        game_array, friendly_team_options, enemy_team_options)

    return select_attackers_strategy


def get_game_array(gamestate_matrix, lower_level_strategies):
    game_matrix = []

    for gamestate_row in gamestate_matrix:

        matrix_row = []

        for _gamestate in gamestate_row:
            game_overview = lower_level_strategies[_gamestate.get_key()]
            game_value = game_overview[2]
            matrix_row.append(game_value)

        game_matrix.append(matrix_row)

    game_array = np.array(game_matrix)

    return game_array


def discard_attacker(ctx, n, selected_attackers_gamestate, select_defender_strategies):
    def get_game_key(extra_friend, extra_enemy):
        friendly_team_permutation = TeamPermutation(
            selected_attackers_gamestate.friendly_team_permutation.remaining_players + [extra_friend])

        enemy_team_permutation = TeamPermutation(
            selected_attackers_gamestate.enemy_team_permutation.remaining_players + [extra_enemy])

        game_permutation = GameState(DraftStage.none, friendly_team_permutation, enemy_team_permutation)
        game_key = game_permutation.get_key()

        return game_key

    f_defender = selected_attackers_gamestate.friendly_team_permutation.defender
    f_attacker_A = selected_attackers_gamestate.friendly_team_permutation.attacker_A
    f_attacker_B = selected_attackers_gamestate.friendly_team_permutation.attacker_B
    remaining_friends = selected_attackers_gamestate.friendly_team_permutation.remaining_players

    e_defender = selected_attackers_gamestate.enemy_team_permutation.defender
    e_attacker_A = selected_attackers_gamestate.enemy_team_permutation.attacker_A
    e_attacker_B = selected_attackers_gamestate.enemy_team_permutation.attacker_B
    remaining_enemies = selected_attackers_gamestate.enemy_team_permutation.remaining_players

    if n == 4:
        return discard_attacker_4(ctx, f_defender, f_attacker_A, f_attacker_B, remaining_friends[0],
            e_defender, e_attacker_A, e_attacker_B, remaining_enemies[0])

    fD_eA = ctx.pairing.value(f_defender, e_attacker_A, Defender.FRIENDLY)
    fD_eB = ctx.pairing.value(f_defender, e_attacker_B, Defender.FRIENDLY)
    fA_eD = ctx.pairing.value(f_attacker_A, e_defender, Defender.ENEMY)
    fB_eD = ctx.pairing.value(f_attacker_B, e_defender, Defender.ENEMY)

    # The child gamestate receives the REFUSED attackers back into the pools
    # (issue #32): in AB, e_B plays the friendly defender and f_A plays the
    # enemy defender, so the refused pair returning to the pools is (f_B, e_A)
    # -- and mirrored in BA. The kept attackers' games are the fD_*/f*_eD terms.
    AA = fD_eB + fB_eD + select_defender_strategies[get_game_key(f_attacker_A, e_attacker_A)][2]
    AB = fD_eB + fA_eD + select_defender_strategies[get_game_key(f_attacker_B, e_attacker_A)][2]
    BA = fD_eA + fB_eD + select_defender_strategies[get_game_key(f_attacker_A, e_attacker_B)][2]
    BB = fD_eA + fA_eD + select_defender_strategies[get_game_key(f_attacker_B, e_attacker_B)][2]

    game_array = np.array([[AA, AB], [BA, BB]])
    discard_attacker_strategy = utilities.get_game_strategy(ctx.game_solution_caches["discard_attacker"][n], game_array,
        [e_attacker_A, e_attacker_B], [f_attacker_A, f_attacker_B])

    return discard_attacker_strategy


def discard_attacker_4(ctx, f_defender, f_attacker_A, f_attacker_B, f_not_selected, e_defender,
        e_attacker_A, e_attacker_B, e_not_selected):

    fD_eA = ctx.pairing.value(f_defender, e_attacker_A, Defender.FRIENDLY)
    fD_eB = ctx.pairing.value(f_defender, e_attacker_B, Defender.FRIENDLY)
    fA_eD = ctx.pairing.value(f_attacker_A, e_defender, Defender.ENEMY)
    fB_eD = ctx.pairing.value(f_attacker_B, e_defender, Defender.ENEMY)

    fA_eA = ctx.pairing.value(f_attacker_A, e_attacker_A)
    fA_eB = ctx.pairing.value(f_attacker_A, e_attacker_B)
    fB_eA = ctx.pairing.value(f_attacker_B, e_attacker_A)
    fB_eB = ctx.pairing.value(f_attacker_B, e_attacker_B)

    fN_eN = ctx.pairing.value(f_not_selected, e_not_selected)

    AA = fD_eB + fB_eD + fA_eA + fN_eN
    AB = fD_eB + fA_eD + fB_eA + fN_eN
    BA = fD_eA + fB_eD + fA_eB + fN_eN
    BB = fD_eA + fA_eD + fB_eB + fN_eN

    game_array = np.array([[AA, AB], [BA, BB]])

    discard_attacker_strategy = utilities.get_game_strategy(ctx.game_solution_caches["discard_attacker"][4],
        game_array, [e_attacker_A, e_attacker_B], [f_attacker_A, f_attacker_B])

    return discard_attacker_strategy