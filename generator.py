import math # standard libraries
import sys

import utilities # local source
import games
import permutations

def get_strategy_dictionaries(match, read = True, write = True):
    matrix = utilities.import_pairing_matrix(match)
    strategy_dictionaries = {}

    def process_draft_stage(draft_stage, n, lower_level_strategies = None):
        if n == 4:
            num = "four"
        elif n == 6:
            num = "six"
        elif n == 8:
            num = "eight"
        else:
            raise Exception("{} is no a legal entry for n. Choose 4, 6 or 8.".format(n))

        iteration_name = num + "_player_" + draft_stage.name + "_dictionary" 
        path = utilities.get_path(match, iteration_name + ".json")

        draft_stage_strategies = None

        if read:
            draft_stage_strategies = utilities.read_strategy_dictionary(path)

        if draft_stage_strategies == None:
            draft_stage_strategies = get_strategy_dictionary(matrix, draft_stage, n, lower_level_strategies)

            if write:
                utilities.write_strategy_dictionary(path, draft_stage_strategies)
        
        strategy_dictionaries[iteration_name] = draft_stage_strategies
        
        return draft_stage_strategies

    discard_attacker_4_strategies = process_draft_stage(utilities.DraftStage.discard_attacker, 4)
    print(len(games.discard_attacker_cache[4]))

    select_attackers_4_strategies = process_draft_stage(utilities.DraftStage.select_attackers, 4, discard_attacker_4_strategies)
    print(len(games.select_attackers_cache[4]))

    select_defender_4_strategies = process_draft_stage(utilities.DraftStage.select_defender, 4, select_attackers_4_strategies)
    print(len(games.select_defender_cache[4]))


    discard_attacker_6_strategies = process_draft_stage(utilities.DraftStage.discard_attacker, 6, select_defender_4_strategies)
    print(len(games.discard_attacker_cache[6]))

    select_attackers_6_strategies = process_draft_stage(utilities.DraftStage.select_attackers, 6, discard_attacker_6_strategies)
    print(len(games.select_attackers_cache[6]))

    select_defender_6_strategies = process_draft_stage(utilities.DraftStage.select_defender, 6, select_attackers_6_strategies)
    print(len(games.select_defender_cache[6]))


    discard_attacker_8_strategies = process_draft_stage(utilities.DraftStage.discard_attacker, 8, select_defender_6_strategies)
    print(len(games.discard_attacker_cache[8]))

    select_attackers_8_strategies = process_draft_stage(utilities.DraftStage.select_attackers, 8, discard_attacker_8_strategies)
    print(len(games.select_attackers_cache[8]))

    select_defender_8_strategies = process_draft_stage(utilities.DraftStage.select_defender, 8, select_attackers_8_strategies)
    print(len(games.select_defender_cache[8]))

    return strategy_dictionaries

def get_strategy_dictionary(matrix, draft_stage, n, lower_level_strategies):
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
        new_percentage = math.floor(counter / len(game_permutations))
        if (new_percentage > percentage):
            percentage = new_percentage
            print(" - {}%: ".format(100 * percentage), counter, "/", len(list(game_permutations)))
        
        f_defender = game_permutation.friendly_team_permutation.defender
        f_attacker_A = game_permutation.friendly_team_permutation.attacker_A
        f_attacker_B = game_permutation.friendly_team_permutation.attacker_B
        remaining_friends = game_permutation.friendly_team_permutation.remaining_players

        e_defender = game_permutation.enemy_team_permutation.defender
        e_attacker_A = game_permutation.enemy_team_permutation.attacker_A
        e_attacker_B = game_permutation.enemy_team_permutation.attacker_B
        remaining_enemies = game_permutation.enemy_team_permutation.remaining_players

        if draft_stage == utilities.DraftStage.discard_attacker:
            strategy = games.discard_attacker(matrix, n, lower_level_strategies, f_defender, f_attacker_A, f_attacker_B, remaining_friends, e_defender, e_attacker_A, e_attacker_B, remaining_enemies)
        elif draft_stage == utilities.DraftStage.select_attackers:
            strategy = games.select_attackers(n, lower_level_strategies, f_defender, remaining_friends, e_defender, remaining_enemies)
        elif draft_stage == utilities.DraftStage.select_defender:
            strategy = games.select_defender(n, lower_level_strategies, remaining_friends, remaining_enemies)
        else:
            return None        

        draft_stage_strategies[game_permutation.get_key()] = [list(strategy[0]), list(strategy[1]), strategy[2]]

    return draft_stage_strategies