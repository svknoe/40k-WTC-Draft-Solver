from itertools import permutations
import numpy as np # standard libraries

import nashpy # 3rd party packages

import utilities # local source
from gamepermutations import GamePermutation, TeamPermutation
import gamepermutations

select_defender_cache = {}
select_defender_cache_4 = {}
select_defender_cache_6 = {}
select_defender_cache_8 = {}
select_defender_cache[4] = select_defender_cache_4
select_defender_cache[6] = select_defender_cache_6
select_defender_cache[8] = select_defender_cache_8

def select_defender(n, select_attackers_strategies, none_game_permutation, round_strategies):
    defender_game_permutations = gamepermutations.get_next_game_permutations(utilities.DraftStage.discard_attacker, none_game_permutation)
        
    defender_matrix = []

    for defender_game_permutation_row in defender_game_permutations:

        defender_matrix_row = []

        for defender_game_permutation in defender_game_permutation_row:
            select_attackers_overview = select_attackers_strategies[defender_game_permutation.get_key()]
            select_attackers_value = select_attackers_overview[2]
            defender_matrix_row.append(select_attackers_value)
        
        defender_matrix.append(defender_matrix_row)

    game_array = np.array(defender_matrix)
    return utilities.evaluate_game(select_defender_cache[n], game_array, round_strategies)

select_attackers_cache = {}
select_attackers_cache_4 = {}
select_attackers_cache_6 = {}
select_attackers_cache_8 = {}
select_attackers_cache[4] = select_attackers_cache_4
select_attackers_cache[6] = select_attackers_cache_6
select_attackers_cache[8] = select_attackers_cache_8

def select_attackers(n, discard_attacker_strategies, defender_game_permutation, round_strategies, restrict_attackers):
    f_defender = defender_game_permutation.friendly_team_permutation.defender
    remaining_friends = defender_game_permutation.friendly_team_permutation.remaining_players

    e_defender = defender_game_permutation.enemy_team_permutation.defender
    remaining_enemies = defender_game_permutation.enemy_team_permutation.remaining_players
    
    size = len(remaining_friends)
    if len(remaining_enemies) != size:
        print("select_attackers() failed.")
        return None

    attackers_matrix = []
    for i in range(0, size - 1):
        f_attacker_A = remaining_friends[i]

        for j in range(i + 1, size):
            f_attacker_B = remaining_friends[j]

            unselected_friends = remaining_friends.copy()
            unselected_friends.remove(f_attacker_A)
            unselected_friends.remove(f_attacker_B)

            row = []

            for k in range(0, size - 1):
                e_attacker_A = remaining_enemies[k]

                for l in range (k + 1, size):
                    e_attacker_B = remaining_enemies[l]

                    unselected_enemies = remaining_enemies.copy()
                    unselected_enemies.remove(e_attacker_A)
                    unselected_enemies.remove(e_attacker_B)

                    friendly_discard_permutation = TeamPermutation(unselected_friends, f_defender, f_attacker_A, f_attacker_B)
                    enemy_discard_permutation = TeamPermutation(unselected_enemies, e_defender, e_attacker_A, e_attacker_B)
                    discard_game_permutation = GamePermutation(friendly_discard_permutation, enemy_discard_permutation)
                    
                    discard_attacker_overview = discard_attacker_strategies[discard_game_permutation.get_key()]
                    discard_attacker_value = discard_attacker_overview[2]
                    row.append(discard_attacker_value)

            attackers_matrix.append(row)

    game_array = np.array(attackers_matrix)
    return utilities.evaluate_game(select_attackers_cache[n], game_array, round_strategies)

discard_attacker_cache = {}
discard_attacker_cache_4 = {}
discard_attacker_cache_6 = {}
discard_attacker_cache_8 = {}
discard_attacker_cache[4] = discard_attacker_cache_4
discard_attacker_cache[6] = discard_attacker_cache_6
discard_attacker_cache[8] = discard_attacker_cache_8

def discard_attacker(matrix, n, select_defender_strategies, f_defender, f_attacker_A, f_attacker_B, other_friends, e_defender, e_attacker_A, e_attacker_B, other_enemies, round_strategies):
    def get_game_key(extra_friend, extra_enemy):
        friendly_team_permutation = TeamPermutation(other_friends + [extra_friend])
        enemy_team_permutation = TeamPermutation(other_enemies + [extra_enemy])
        game_permutation = GamePermutation(friendly_team_permutation, enemy_team_permutation)
        game_key = game_permutation.get_key()

        friendly_team_permutation = TeamPermutation(other_friends + [extra_friend])
        enemy_team_permutation = TeamPermutation(other_enemies + [extra_enemy])
        game_permutation = GamePermutation(friendly_team_permutation, enemy_team_permutation)
        game_key = game_permutation.get_key()

        return game_key
    
    if n == 4:
        return discard_attacker_4(matrix, f_defender, f_attacker_A, f_attacker_B, other_friends[0], e_defender, e_attacker_A, e_attacker_B, other_enemies[0], round_strategies)

    AA = matrix[f_defender][e_attacker_B] + matrix[f_attacker_B][e_defender] + select_defender_strategies[get_game_key(f_attacker_A, e_attacker_A)][2]
    AB = matrix[f_defender][e_attacker_B] + matrix[f_attacker_A][e_defender] + select_defender_strategies[get_game_key(f_attacker_A, e_attacker_B)][2]
    BA = matrix[f_defender][e_attacker_A] + matrix[f_attacker_B][e_defender] + select_defender_strategies[get_game_key(f_attacker_B, e_attacker_A)][2]
    BB = matrix[f_defender][e_attacker_A] + matrix[f_attacker_A][e_defender] + select_defender_strategies[get_game_key(f_attacker_B, e_attacker_B)][2]

    game_array = np.array([[AA, AB], [BA, BB]])
    return utilities.evaluate_game(discard_attacker_cache[n], game_array, round_strategies)

def discard_attacker_4(matrix, f_defender, f_attacker_A, f_attacker_B, f_not_selected, e_defender, e_attacker_A, e_attacker_B, e_not_selected, round_strategies):
    AA = matrix[f_defender][e_attacker_B] + matrix[f_attacker_B][e_defender] + matrix[f_attacker_A][e_attacker_A] + matrix[f_not_selected][e_not_selected]
    AB = matrix[f_defender][e_attacker_B] + matrix[f_attacker_A][e_defender] + matrix[f_attacker_B][e_attacker_A] + matrix[f_not_selected][e_not_selected]
    BA = matrix[f_defender][e_attacker_A] + matrix[f_attacker_B][e_defender] + matrix[f_attacker_A][e_attacker_B] + matrix[f_not_selected][e_not_selected]
    BB = matrix[f_defender][e_attacker_A] + matrix[f_attacker_A][e_defender] + matrix[f_attacker_B][e_attacker_B] + matrix[f_not_selected][e_not_selected]

    game_array = np.array([[AA, AB], [BA, BB]])
    return utilities.evaluate_game(discard_attacker_cache[4], game_array, round_strategies)