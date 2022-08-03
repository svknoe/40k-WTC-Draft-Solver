from itertools import permutations
import numpy as np # standard libraries

import nashpy # 3rd party packages

import utilities # local source
import gamestate
from gamestate import GameState
from teampermutation import TeamPermutation

select_defender_cache = {}
select_defender_cache_4 = {}
select_defender_cache_6 = {}
select_defender_cache_8 = {}
select_defender_cache[4] = select_defender_cache_4
select_defender_cache[6] = select_defender_cache_6
select_defender_cache[8] = select_defender_cache_8

def select_defender(n, none_gamestate, select_attackers_strategies):
    game_array = get_game_array(none_gamestate, select_attackers_strategies)
    select_defender_strategy = utilities.get_game_strategy(select_defender_cache[n], game_array)
    
    return select_defender_strategy

select_attackers_cache = {}
select_attackers_cache_4 = {}
select_attackers_cache_6 = {}
select_attackers_cache_8 = {}
select_attackers_cache[4] = select_attackers_cache_4
select_attackers_cache[6] = select_attackers_cache_6
select_attackers_cache[8] = select_attackers_cache_8

def select_attackers(n, selected_defender_gamestate, discard_attacker_strategies):
    game_array = get_game_array(selected_defender_gamestate, discard_attacker_strategies)
    select_attackers_strategy = utilities.get_game_strategy(select_attackers_cache[n], game_array)
    
    return select_attackers_strategy

discard_attacker_cache = {}
discard_attacker_cache_4 = {}
discard_attacker_cache_6 = {}
discard_attacker_cache_8 = {}
discard_attacker_cache[4] = discard_attacker_cache_4
discard_attacker_cache[6] = discard_attacker_cache_6
discard_attacker_cache[8] = discard_attacker_cache_8

def discard_attacker(matrix, n, selected_attackers_gamestate, select_defender_strategies):
    def get_game_key(extra_friend, extra_enemy):
        friendly_team_permutation = TeamPermutation(selected_attackers_gamestate.friendly_team_permutation.remaining_players + [extra_friend])
        enemy_team_permutation = TeamPermutation(selected_attackers_gamestate.enemy_team_permutation.remaining_players + [extra_enemy])
        game_permutation = GameState(utilities.DraftStage.none, friendly_team_permutation, enemy_team_permutation)
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
        return discard_attacker_4(matrix, f_defender, f_attacker_A, f_attacker_B, remaining_friends[0], e_defender, e_attacker_A, e_attacker_B, remaining_enemies[0])

    AA = matrix[f_defender][e_attacker_B] + matrix[f_attacker_B][e_defender] + select_defender_strategies[get_game_key(f_attacker_A, e_attacker_A)][2]
    AB = matrix[f_defender][e_attacker_B] + matrix[f_attacker_A][e_defender] + select_defender_strategies[get_game_key(f_attacker_A, e_attacker_B)][2]
    BA = matrix[f_defender][e_attacker_A] + matrix[f_attacker_B][e_defender] + select_defender_strategies[get_game_key(f_attacker_B, e_attacker_A)][2]
    BB = matrix[f_defender][e_attacker_A] + matrix[f_attacker_A][e_defender] + select_defender_strategies[get_game_key(f_attacker_B, e_attacker_B)][2]

    game_array = np.array([[AA, AB], [BA, BB]])
    discard_attacker_strategy = utilities.get_game_strategy(discard_attacker_cache[n], game_array)
    
    return discard_attacker_strategy

def discard_attacker_4(matrix, f_defender, f_attacker_A, f_attacker_B, f_not_selected, e_defender, e_attacker_A, e_attacker_B, e_not_selected):
    AA = matrix[f_defender][e_attacker_B] + matrix[f_attacker_B][e_defender] + matrix[f_attacker_A][e_attacker_A] + matrix[f_not_selected][e_not_selected]
    AB = matrix[f_defender][e_attacker_B] + matrix[f_attacker_A][e_defender] + matrix[f_attacker_B][e_attacker_A] + matrix[f_not_selected][e_not_selected]
    BA = matrix[f_defender][e_attacker_A] + matrix[f_attacker_B][e_defender] + matrix[f_attacker_A][e_attacker_B] + matrix[f_not_selected][e_not_selected]
    BB = matrix[f_defender][e_attacker_A] + matrix[f_attacker_A][e_defender] + matrix[f_attacker_B][e_attacker_B] + matrix[f_not_selected][e_not_selected]

    game_array = np.array([[AA, AB], [BA, BB]])
    discard_attacker_strategy = utilities.get_game_strategy(discard_attacker_cache[4], game_array)

    return discard_attacker_strategy

def get_game_array(higher_level_gamestate, lower_level_strategies):
    gamestate_matrix = gamestate.get_next_gamestate_matrix(higher_level_gamestate)        
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