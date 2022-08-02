import math # standard libraries
import sys
import time
from varname import nameof

import utilities # local source
import games
import gamepermutations
from gamepermutations import GamePermutation, TeamPermutation

eight_player_defender_permutation_dictionary = {}
eight_player_attackers_permutation_dictionary = {}
eight_player_discard_permutation_dictionary = {}

six_player_defender_permutation_dictionary = {}
six_player_attackers_permutation_dictionary = {}
six_player_discard_permutation_dictionary = {}

four_player_defender_permutation_dictionary = {}
four_player_attackers_permutation_dictionary = {}
four_player_discard_permutation_dictionary = {}

def initialise_game_permutation_dictionaries(matrix):
    print("Initilising game permutation dictionaries...")
    initial_game_state = get_initial_game_state(matrix)

    eight_player_defender_permutations = gamepermutations.get_next_game_permutations(None, initial_game_state)
    eight_player_defender_permutation_dictionary = {}
    add_game_permutations_to_dictionary(eight_player_defender_permutation_dictionary, eight_player_defender_permutations)

    initialise_game_permutation_dictionary(eight_player_attackers_permutation_dictionary, eight_player_defender_permutation_dictionary, utilities.DraftStage.select_attackers)
    initialise_game_permutation_dictionary(eight_player_discard_permutation_dictionary, eight_player_attackers_permutation_dictionary, utilities.DraftStage.discard_attacker)

    initialise_game_permutation_dictionary(six_player_defender_permutation_dictionary, eight_player_discard_permutation_dictionary, utilities.DraftStage.select_defender)
    initialise_game_permutation_dictionary(six_player_attackers_permutation_dictionary, six_player_defender_permutation_dictionary, utilities.DraftStage.select_attackers)
    initialise_game_permutation_dictionary(six_player_discard_permutation_dictionary, six_player_attackers_permutation_dictionary, utilities.DraftStage.discard_attacker)

    initialise_game_permutation_dictionary(four_player_defender_permutation_dictionary, six_player_discard_permutation_dictionary, utilities.DraftStage.select_defender)
    initialise_game_permutation_dictionary(four_player_attackers_permutation_dictionary, four_player_defender_permutation_dictionary, utilities.DraftStage.select_attackers)
    initialise_game_permutation_dictionary(four_player_discard_permutation_dictionary, four_player_attackers_permutation_dictionary, utilities.DraftStage.discard_attacker)


def initialise_game_permutation_dictionary(dictionary, parent_dictionary, draft_stage):
    print("Initilising {}...".format(nameof(dictionary)))
    dictionary = {}
    next_draft_stage = utilities.get_next_draft_stage(draft_stage)

    for parent_key in parent_dictionary:
        parent_game_permutation = parent_dictionary[parent_key]
        game_permutations = gamepermutations.get_next_game_permutations(next_draft_stage, parent_game_permutation)
        add_game_permutations_to_dictionary(dictionary, game_permutations)

def add_game_permutations_to_dictionary(dictionary, game_permutations):
    for game_permutation in game_permutations:
        add_game_permutation_to_dictionary(dictionary, game_permutation)

def add_game_permutation_to_dictionary(dictionary, game_permutation)
    permutation_key = game_permutation.get_key()

    if not permutation_key in dictionary:
        dictionary[permutation_key] = game_permutation

def get_initial_game_state(matrix):
    friends = [friend for friend in matrix]
    enemies = [enemy for enemy in matrix[friends[0]]]
    initial_game_state = GamePermutation(TeamPermutation(friends), TeamPermutation(enemies))

    return initial_game_state


# TODO: Current plan is to enumerate all game permutations to be solved from top to bottom, then solve them from the bottom and up.
def get_strategy_dictionaries(match, read = True, write = True, round_strategies = False, restrict_attackers = True):
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
            draft_stage_strategies = get_strategy_dictionary(matrix, draft_stage, n, lower_level_strategies, round_strategies, restrict_attackers)

            if write:
                utilities.write_strategy_dictionary(path, draft_stage_strategies)
        
        strategy_dictionaries[iteration_name] = draft_stage_strategies
        
        return draft_stage_strategies

    discard_attacker_4_strategies = process_draft_stage(utilities.DraftStage.discard_attacker, 4)
    print(len(games.discard_attacker_cache[4]))

    select_attackers_4_strategies = process_draft_stage(utilities.DraftStage.select_attackers, 4, discard_attacker_4_strategies)
    print(len(games.select_attackers_cache[4]))

    return

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


def get_strategy_dictionary(matrix, draft_stage_to_solve, n, lower_level_strategies, round_strategies, restrict_attackers):
    if (not (n == 4 or n == 6 or n == 8)):
        sys.exit("{} is not a valid number of players. Choose 4, 6 or 8.".format(n))

    previous_stage = utilities.DraftStage(draft_stage_to_solve.value - 1)
    game_permutations_to_solve = gamepermutations.get_game_permutations(matrix, previous_stage, n, restrict_attackers)

    print("Generating {}-player {} strategies:".format(n, draft_stage_to_solve.name))
    counter = 0
    percentage = -1
    draft_stage_strategies = {}
    previous_time = time.time()
    for game_permutation in game_permutations_to_solve:
        counter += 1
        new_percentage = math.floor(10 * counter / len(game_permutations_to_solve))
        new_time = time.time()
        if (new_percentage > percentage):
            percentage = new_percentage
            print(" - {}%: ".format(10 * percentage), counter, "/", len(list(game_permutations_to_solve)))
        elif new_time - previous_time > 30:
            print(" - {}%: ".format(10 * percentage), counter, "/", len(list(game_permutations_to_solve)))
        
        f_defender = game_permutation.friendly_team_permutation.defender
        f_attacker_A = game_permutation.friendly_team_permutation.attacker_A
        f_attacker_B = game_permutation.friendly_team_permutation.attacker_B
        remaining_friends = game_permutation.friendly_team_permutation.remaining_players

        e_defender = game_permutation.enemy_team_permutation.defender
        e_attacker_A = game_permutation.enemy_team_permutation.attacker_A
        e_attacker_B = game_permutation.enemy_team_permutation.attacker_B
        remaining_enemies = game_permutation.enemy_team_permutation.remaining_players

        if draft_stage_to_solve == utilities.DraftStage.discard_attacker:
            strategy = games.discard_attacker(matrix, n, lower_level_strategies, f_defender, f_attacker_A, f_attacker_B, remaining_friends, e_defender, e_attacker_A, e_attacker_B, remaining_enemies, round_strategies)
        elif draft_stage_to_solve == utilities.DraftStage.select_attackers:
            strategy = games.select_attackers(n, lower_level_strategies, f_defender, remaining_friends, e_defender, remaining_enemies, round_strategies, restrict_attackers)
        elif draft_stage_to_solve == utilities.DraftStage.select_defender:
            strategy = games.select_defender(n, lower_level_strategies, remaining_friends, remaining_enemies, round_strategies)
        else:
            return None        

        draft_stage_strategies[game_permutation.get_key()] = [list(strategy[0]), list(strategy[1]), strategy[2]]
        previous_time = new_time

    return draft_stage_strategies
