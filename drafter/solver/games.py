import numpy as np  # standard libraries

import drafter.common.utilities as utilities  # local source
import drafter.common.game_state as game_state
from drafter.common.game_state import GameState
from drafter.common.team_permutation import TeamPermutation
from drafter.common.draft_stage import DraftStage

select_defender_cache = {}
select_defender_cache_4 = {}
select_defender_cache_6 = {}
select_defender_cache_8 = {}
select_defender_cache[4] = select_defender_cache_4
select_defender_cache[6] = select_defender_cache_6
select_defender_cache[8] = select_defender_cache_8


def select_defender(n, none_gamestate, select_attackers_strategies):
    gamestate_matrix = game_state.get_next_gamestate_matrix(none_gamestate)
    friendly_team_options = [row[0].friendly_team_permutation.defender for row in gamestate_matrix]
    enemy_team_options = [_gamestate.enemy_team_permutation.defender for _gamestate in gamestate_matrix[0]]
    game_array = get_game_array(gamestate_matrix, select_attackers_strategies)
    select_defender_strategy = utilities.get_game_strategy(select_defender_cache[n],
        game_array, friendly_team_options, enemy_team_options)

    return select_defender_strategy


select_attackers_cache = {}
select_attackers_cache_4 = {}
select_attackers_cache_6 = {}
select_attackers_cache_8 = {}
select_attackers_cache[4] = select_attackers_cache_4
select_attackers_cache[6] = select_attackers_cache_6
select_attackers_cache[8] = select_attackers_cache_8


def select_attackers(n, selected_defender_gamestate, discard_attacker_strategies):
    gamestate_matrix = game_state.get_next_gamestate_matrix(selected_defender_gamestate)

    friendly_team_options = [[row[0].friendly_team_permutation.attacker_A,
        row[0].friendly_team_permutation.attacker_B] for row in gamestate_matrix]

    enemy_team_options = [[gamestate.enemy_team_permutation.attacker_A,
        gamestate.enemy_team_permutation.attacker_B] for gamestate in gamestate_matrix[0]]  # TODO ?

    game_array = get_game_array(gamestate_matrix, discard_attacker_strategies)

    select_attackers_strategy = utilities.get_game_strategy(select_attackers_cache[n],
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


discard_attacker_cache = {}
discard_attacker_cache_4 = {}
discard_attacker_cache_6 = {}
discard_attacker_cache_8 = {}
discard_attacker_cache[4] = discard_attacker_cache_4
discard_attacker_cache[6] = discard_attacker_cache_6
discard_attacker_cache[8] = discard_attacker_cache_8


def discard_attacker(n, selected_attackers_gamestate, select_defender_strategies):
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
        return discard_attacker_4(f_defender, f_attacker_A, f_attacker_B, remaining_friends[0],
            e_defender, e_attacker_A, e_attacker_B, remaining_enemies[0])

    fD_eA = utilities.get_pairing_value(4, f_defender, e_attacker_A, f_defender)
    fD_eB = utilities.get_pairing_value(4, f_defender, e_attacker_B, f_defender)
    fA_eD = utilities.get_pairing_value(4, f_attacker_A, e_defender, e_defender)
    fB_eD = utilities.get_pairing_value(4, f_attacker_B, e_defender, e_defender)

    AA = fD_eB + fB_eD + select_defender_strategies[get_game_key(f_attacker_A, e_attacker_A)][2]
    AB = fD_eB + fA_eD + select_defender_strategies[get_game_key(f_attacker_A, e_attacker_B)][2]
    BA = fD_eA + fB_eD + select_defender_strategies[get_game_key(f_attacker_B, e_attacker_A)][2]
    BB = fD_eA + fA_eD + select_defender_strategies[get_game_key(f_attacker_B, e_attacker_B)][2]

    game_array = np.array([[AA, AB], [BA, BB]])
    discard_attacker_strategy = utilities.get_game_strategy(discard_attacker_cache[n], game_array,
        [e_attacker_A, e_attacker_B], [f_attacker_A, f_attacker_B])

    return discard_attacker_strategy


def discard_attacker_4(f_defender, f_attacker_A, f_attacker_B, f_not_selected, e_defender,
        e_attacker_A, e_attacker_B, e_not_selected):

    fD_eA = utilities.get_pairing_value(4, f_defender, e_attacker_A, f_defender)
    fD_eB = utilities.get_pairing_value(4, f_defender, e_attacker_B, f_defender)
    fA_eD = utilities.get_pairing_value(4, f_attacker_A, e_defender, e_defender)
    fB_eD = utilities.get_pairing_value(4, f_attacker_B, e_defender, e_defender)

    fA_eA = utilities.get_pairing_value(4, f_attacker_A, e_attacker_A)
    fA_eB = utilities.get_pairing_value(4, f_attacker_A, e_attacker_B)
    fB_eA = utilities.get_pairing_value(4, f_attacker_B, e_attacker_A)
    fB_eB = utilities.get_pairing_value(4, f_attacker_B, e_attacker_B)

    fN_eN = utilities.get_pairing_value(4, f_not_selected, e_not_selected)

    AA = fD_eB + fB_eD + fA_eA + fN_eN
    AB = fD_eB + fA_eD + fB_eA + fN_eN
    BA = fD_eA + fB_eD + fA_eB + fN_eN
    BB = fD_eA + fA_eD + fB_eB + fN_eN

    game_array = np.array([[AA, AB], [BA, BB]])

    discard_attacker_strategy = utilities.get_game_strategy(discard_attacker_cache[4],
        game_array, [e_attacker_A, e_attacker_B], [f_attacker_A, f_attacker_B])

    return discard_attacker_strategy