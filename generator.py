import math # standard libraries
import sys
import time

import utilities # local source
import games
import gamestate
from gamestate import GameState
import teampermutation
from teampermutation import TeamPermutation

eight_player_defender_gamestate_dictionary = {}
eight_player_attackers_gamestate_dictionary = {}
eight_player_discard_gamestate_dictionary = {}

six_player_defender_gamestate_dictionary = {}
six_player_attackers_gamestate_dictionary = {}
six_player_discard_gamestate_dictionary = {}

four_player_defender_gamestate_dictionary = {}
four_player_attackers_gamestate_dictionary = {}
four_player_discard_gamestate_dictionary = {}

def initialise_game_permutation_dictionaries(pairing_dictionary):
    print("Initialising gamestate dictionaries...")
    initial_game_state = get_initial_game_state(pairing_dictionary)

    print(" - Initialising {}...".format("eight player defender gamestate dictionary"))
    eight_player_defender_gamestates = gamestate.get_next_gamestates(initial_game_state)
    add_gamestates_to_dictionary(eight_player_defender_gamestate_dictionary, eight_player_defender_gamestates)
    print("    - Done: {} gamestates".format(len(eight_player_defender_gamestate_dictionary)))

    initialise_gamestate_dictionary(eight_player_attackers_gamestate_dictionary, eight_player_defender_gamestate_dictionary, "eight player attackers gamestate dictionary")
    initialise_gamestate_dictionary(eight_player_discard_gamestate_dictionary, eight_player_attackers_gamestate_dictionary, "eight player discard gamestate dictionary")

    initialise_gamestate_dictionary(six_player_defender_gamestate_dictionary, eight_player_discard_gamestate_dictionary, "six player defender gamestate dictionary")
    initialise_gamestate_dictionary(six_player_attackers_gamestate_dictionary, six_player_defender_gamestate_dictionary, "six player attackers gamestate dictionary")
    initialise_gamestate_dictionary(six_player_discard_gamestate_dictionary, six_player_attackers_gamestate_dictionary, "six player discard gamestate dictionary")

    initialise_gamestate_dictionary(four_player_defender_gamestate_dictionary, six_player_discard_gamestate_dictionary, "four player defender gamestate dictionary")
    initialise_gamestate_dictionary(four_player_attackers_gamestate_dictionary, four_player_defender_gamestate_dictionary, "four player attackers gamestate dictionary")
    initialise_gamestate_dictionary(four_player_discard_gamestate_dictionary, four_player_attackers_gamestate_dictionary, "four player discard gamestate dictionary")

def initialise_gamestate_dictionary(dictionary, parent_dictionary, dictionary_name):
    print(" - Initialising {}...".format(dictionary_name))

    for parent_key in parent_dictionary:
        parent_gamestate = parent_dictionary[parent_key]
        gamestates = gamestate.get_next_gamestates(parent_gamestate)
        add_gamestates_to_dictionary(dictionary, gamestates)

    print("    - Done: {} gamestates".format(len(dictionary)))
    return dictionary

def add_gamestates_to_dictionary(dictionary, gamestates):
    for gamestate in gamestates:
        add_gamestate_to_dictionary(dictionary, gamestate)

def add_gamestate_to_dictionary(dictionary, gamestate):
    key = gamestate.get_key()

    if not key in dictionary:
        dictionary[key] = gamestate

def get_initial_game_state(pairing_dictionary):
    friends = [friend for friend in pairing_dictionary]
    enemies = [enemy for enemy in pairing_dictionary[friends[0]]]
    initial_game_state = GameState(utilities.DraftStage.none, TeamPermutation(friends), TeamPermutation(enemies))

    return initial_game_state

def get_strategy_dictionaries(match, read = True, write = True, restrict_attackers = False, round_strategies = False):
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
            draft_stage_strategies = get_strategy_dictionary(pairing_dictionary, draft_stage, n, lower_level_strategies, round_strategies)

            if write:
                utilities.write_strategy_dictionary(path, draft_stage_strategies)
        
        strategy_dictionaries[iteration_name] = draft_stage_strategies
        
        return draft_stage_strategies
    
    pairing_dictionary = utilities.import_pairing_dictionary(match)

    if (restrict_attackers):
        teampermutation.enable_restricted_attackers(pairing_dictionary, 3)

    initialise_game_permutation_dictionaries(pairing_dictionary)
    strategy_dictionaries = {}

    discard_attacker_4_strategies = process_draft_stage(utilities.DraftStage.attacker_discarded, 4)
    print(len(games.discard_attacker_cache[4]))

    select_attackers_4_strategies = process_draft_stage(utilities.DraftStage.attackers_selected, 4, discard_attacker_4_strategies)
    print(len(games.select_attackers_cache[4]))

    select_defender_4_strategies = process_draft_stage(utilities.DraftStage.defender_selected, 4, select_attackers_4_strategies)
    print(len(games.select_defender_cache[4]))


    discard_attacker_6_strategies = process_draft_stage(utilities.DraftStage.attacker_discarded, 6, select_defender_4_strategies)
    print(len(games.discard_attacker_cache[6]))

    select_attackers_6_strategies = process_draft_stage(utilities.DraftStage.attackers_selected, 6, discard_attacker_6_strategies)
    print(len(games.select_attackers_cache[6]))

    select_defender_6_strategies = process_draft_stage(utilities.DraftStage.defender_selected, 6, select_attackers_6_strategies)
    print(len(games.select_defender_cache[6]))


    discard_attacker_8_strategies = process_draft_stage(utilities.DraftStage.attacker_discarded, 8, select_defender_6_strategies)
    print(len(games.discard_attacker_cache[8]))

    select_attackers_8_strategies = process_draft_stage(utilities.DraftStage.attackers_selected, 8, discard_attacker_8_strategies)
    print(len(games.select_attackers_cache[8]))

    select_defender_8_strategies = process_draft_stage(utilities.DraftStage.defender_selected, 8, select_attackers_8_strategies)
    print(len(games.select_defender_cache[8]))

    return strategy_dictionaries

def get_strategy_dictionary(pairing_dictionary, gamestates_to_solve, lower_level_strategies, round_strategies):
    arbitrary_gamestate = gamestates_to_solve[0]
    draft_stage_to_solve = arbitrary_gamestate.draft_stage

    n = len(arbitrary_gamestate.remaining_players)
    if arbitrary_gamestate.defender != None:
        n += 1
    if arbitrary_gamestate.attacker_A != None:
        n += 1
    if arbitrary_gamestate.attacker_B != None:
        n += 1
    
    if (not (n == 4 or n == 6 or n == 8)):
        sys.exit("{} is not a valid number of players. Choose 4, 6 or 8.".format(n))

    print("Generating {}-player {} strategies:".format(n, draft_stage_to_solve.name))
    counter = 0
    percentage = -1
    draft_stage_strategies = {}
    previous_time = time.time()
    for game_permutation in gamestates_to_solve:
        counter += 1
        new_percentage = math.floor(10 * counter / len(gamestates_to_solve))
        new_time = time.time()
        if (new_percentage > percentage):
            percentage = new_percentage
            print(" - {}%: ".format(10 * percentage), counter, "/", len(list(gamestates_to_solve)))
        elif new_time - previous_time > 30:
            print(" - {}%: ".format(10 * percentage), counter, "/", len(list(gamestates_to_solve)))
        
        f_defender = game_permutation.friendly_team_permutation.defender
        f_attacker_A = game_permutation.friendly_team_permutation.attacker_A
        f_attacker_B = game_permutation.friendly_team_permutation.attacker_B
        remaining_friends = game_permutation.friendly_team_permutation.remaining_players

        e_defender = game_permutation.enemy_team_permutation.defender
        e_attacker_A = game_permutation.enemy_team_permutation.attacker_A
        e_attacker_B = game_permutation.enemy_team_permutation.attacker_B
        remaining_enemies = game_permutation.enemy_team_permutation.remaining_players

        if draft_stage_to_solve == utilities.DraftStage.attacker_discarded:
            strategy = games.discard_attacker(pairing_dictionary, n, lower_level_strategies, f_defender, f_attacker_A, f_attacker_B, remaining_friends, e_defender, e_attacker_A, e_attacker_B, remaining_enemies, round_strategies)
        elif draft_stage_to_solve == utilities.DraftStage.attackers_selected:
            strategy = games.select_attackers(n, lower_level_strategies, f_defender, remaining_friends, e_defender, remaining_enemies, round_strategies)
        elif draft_stage_to_solve == utilities.DraftStage.defender_selected:
            strategy = games.select_defender(n, lower_level_strategies, remaining_friends, remaining_enemies, round_strategies)
        else:
            return None        

        draft_stage_strategies[game_permutation.get_key()] = [list(strategy[0]), list(strategy[1]), strategy[2]]
        previous_time = new_time

    return draft_stage_strategies
