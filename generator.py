import time # standard libraries
import itertools
import math
import sys

import utilities # local source
import initial
import final
import permutations

def generate_strategy_dictionaries(match):
    matrix = utilities.import_pairing_matrix(match)

    four_player_discard_attacker_strategies = get_strategy_dictionary(matrix, utilities.DraftStage.discard_attacker , 4)
    #utilities.write_strategy_with_print_calls(match, four_player_discard_attacker_strategies, "four_player_discard_attacker_dictionary.json")
    #print("cache size: ", len(final.discard_attacker_cache))

    four_player_select_attackers_strategies = get_strategy_dictionary(matrix, utilities.DraftStage.select_attackers, 4, four_player_discard_attacker_strategies)
    #utilities.write_strategy_with_print_calls(match, four_player_select_attackers_strategies, "four_player_select_attackers_dictionary.json")
    print("cache size: ", len(final.select_attackers_cache)) 

def get_strategy_dictionary(matrix, draft_stage, n, lower_level_strategies = None):
    if (not (n == 4 or n == 6 or n == 8)):
        sys.exit("{} is not a valid number of players. Choose 4, 6 or 8.".format(n))

    higher_level_stage = utilities.DraftStage(draft_stage.value - 1)
    game_permutations = permutations.get_game_permutations(matrix, higher_level_stage, n)

    print("Generating {}-player {} strategies:".format(n, draft_stage.name))
    counter = 0
    percentage = -1
    draft_stage_strategies = {}
    for game_permutation in game_permutations:
        counter += 1
        new_percentage = math.floor(10 * counter / len(game_permutations))
        if (new_percentage > percentage):
            percentage = new_percentage
            print(" - {}%: ".format(10 * percentage), counter, "/", len(list(game_permutations)))
        
        f_defender = game_permutation.friendly_team_permutation.defender
        f_attacker_A = game_permutation.friendly_team_permutation.attacker_A
        f_attacker_B = game_permutation.friendly_team_permutation.attacker_B
        remaining_friends = game_permutation.friendly_team_permutation.remaining_players

        e_defender = game_permutation.enemy_team_permutation.defender
        e_attacker_A = game_permutation.enemy_team_permutation.attacker_A
        e_attacker_B = game_permutation.enemy_team_permutation.attacker_B
        remaining_enemies = game_permutation.enemy_team_permutation.remaining_players

        if draft_stage == utilities.DraftStage.discard_attacker:
            if (n == 4):
                strategy = final.discard_attacker(matrix, f_defender, f_attacker_A, f_attacker_B, remaining_friends[0], e_defender, e_attacker_A, e_attacker_B, remaining_enemies[0])
            else:
                strategy = initial.discard_attacker(matrix, f_defender, f_attacker_A, f_attacker_B, remaining_friends, e_defender, e_attacker_A, e_attacker_B, remaining_enemies)
        elif draft_stage == utilities.DraftStage.select_attackers:
            if (n == 4):
                strategy = final.select_attackers(lower_level_strategies, f_defender, remaining_friends, e_defender, remaining_enemies)
            else:
                strategy = initial.select_attackers(lower_level_strategies, f_defender, remaining_friends, e_defender, remaining_enemies)
        elif draft_stage == utilities.DraftStage.select_defender:
            if (n == 4):
                strategy = final.select_defender(lower_level_strategies, remaining_friends, remaining_enemies)
            else:
                strategy = initial.select_defender(lower_level_strategies, remaining_friends, remaining_enemies)
        else:
            return None        

        draft_stage_strategies[game_permutation.get_key()] = [list(strategy[0]), list(strategy[1]), strategy[2]]

    return draft_stage_strategies

t0 = time.time()

print("Starting script")
generate_strategy_dictionaries("Germany")

print(time.time() - t0)