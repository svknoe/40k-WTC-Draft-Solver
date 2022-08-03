import math # standard libraries
import sys
import time

import utilities # local source
import games
import gamestate
import gamestatedictionaries
from gamestate import GameState
import teampermutation
from teampermutation import TeamPermutation

dictionaries = {}
dictionaries[utilities.get_strategy_dictionary_name(8, utilities.select_defender)] = {'descriptor':[8, utilities.select_defender]}
dictionaries[utilities.get_strategy_dictionary_name(8, utilities.select_attackers)] = {'descriptor':[8, utilities.select_attackers]}
dictionaries[utilities.get_strategy_dictionary_name(8, utilities.discard_attacker)] = {'descriptor':[8, utilities.discard_attacker]}
dictionaries[utilities.get_strategy_dictionary_name(6, utilities.select_defender)] = {'descriptor':[6, utilities.select_defender]}
dictionaries[utilities.get_strategy_dictionary_name(6, utilities.select_attackers)] = {'descriptor':[6, utilities.select_attackers]}
dictionaries[utilities.get_strategy_dictionary_name(6, utilities.discard_attacker)] = {'descriptor':[6, utilities.discard_attacker]}
dictionaries[utilities.get_strategy_dictionary_name(4, utilities.select_defender)] = {'descriptor':[4, utilities.select_defender]}
dictionaries[utilities.get_strategy_dictionary_name(4, utilities.select_attackers)] = {'descriptor':[4, utilities.select_attackers]}
dictionaries[utilities.get_strategy_dictionary_name(4, utilities.discard_attacker)] = {'descriptor':[4, utilities.discard_attacker]}

def extend_strategy_dictionary(gamestates_to_solve, lower_level_strategies = None, read = False, write = False):
    arbitrary_gamestate = gamestates_to_solve[list(gamestates_to_solve.keys())[0]]
    n = arbitrary_gamestate.get_n()
    draft_stage_to_solve = utilities.get_next_draft_stage(arbitrary_gamestate.draft_stage)
    iteration_name = arbitrary_gamestate.get_strategy_dictionary_name()
    path = utilities.get_path(match, iteration_name + ".json")

    draft_stage_strategies = None

    if read:
        draft_stage_strategies = utilities.read_strategy_dictionary(path)

    if draft_stage_strategies == None:
        draft_stage_strategies = get_strategy_dictionary(pairing_dictionary, gamestates_to_solve, lower_level_strategies)

        if write:
            utilities.write_strategy_dictionary(path, draft_stage_strategies)
    
    dictionaries[iteration_name] = draft_stage_strategies
        
    return draft_stage_strategies

def initialise_dictionaries(match, read = True, write = True, restrict_attackers = False, round_strategies = False):
    def process_draft_stage(gamestates_to_solve, lower_level_strategies = None):
        return extend_strategy_dictionary(gamestates_to_solve, lower_level_strategies, read, write)



    print("Generating strategy dictionaries:")

    gamestate_dictionary = utilities.get_gamestate_dictionary_name(4, utilities.select_attackers)
    strategy_dictionary = process_draft_stage(gamestate_dictionary):

    while strategy_dictionary != None:
        gamestate_dictionary = gamestatedictionaries.get_previous_gamestate_dictionary(gamestate_dictionary)
        strategy_dictionary = process_draft_stage(gamestate_dictionary, strategy_dictionary):

    return

    discard_attacker_4_strategies = process_draft_stage(four_player_attackers_gamestate_dictionary)
    print(len(games.discard_attacker_cache[4]))

    select_attackers_4_strategies = process_draft_stage(four_player_defender_gamestate_dictionary, discard_attacker_4_strategies)
    print(len(games.select_attackers_cache[4]))

    select_defender_4_strategies = process_draft_stage(four_player_none_gamestate_dictionary, select_attackers_4_strategies)
    print(len(games.select_defender_cache[4]))


    discard_attacker_6_strategies = process_draft_stage(six_player_attackers_gamestate_dictionary, select_defender_4_strategies)
    print(len(games.discard_attacker_cache[6]))

    select_attackers_6_strategies = process_draft_stage(six_player_defender_gamestate_dictionary, discard_attacker_6_strategies)
    print(len(games.select_attackers_cache[6]))

    select_defender_6_strategies = process_draft_stage(six_player_none_gamestate_dictionary, select_attackers_6_strategies)
    print(len(games.select_defender_cache[6]))


    discard_attacker_8_strategies = process_draft_stage(eight_player_attackers_gamestate_dictionary, select_defender_6_strategies)
    print(len(games.discard_attacker_cache[8]))

    select_attackers_8_strategies = process_draft_stage(eight_player_defender_gamestate_dictionary, discard_attacker_8_strategies)
    print(len(games.select_attackers_cache[8]))

    select_defender_8_strategies = process_draft_stage(eight_player_none_gamestate_dictionary, select_attackers_8_strategies)
    print(len(games.select_defender_cache[8]))

    return dictionaries

def get_strategy_dictionary(pairing_dictionary, gamestates_to_solve, lower_level_strategies, n, draft_stage_to_solve):
    arbitrary_gamestate = gamestates_to_solve[list(gamestates_to_solve.keys())[0]]
    n = arbitrary_gamestate.get_n()
    draft_stage_to_solve = utilities.get_next_draft_stage(arbitrary_gamestate.draft_stage)

    if (not (n == 4 or n == 6 or n == 8)):
        sys.exit("{} is not a valid number of players. Choose 4, 6 or 8.".format(n))

    print(" - Generating {}-player {} strategies:".format(n, draft_stage_to_solve.name))
    counter = 0
    percentage = -1
    draft_stage_strategies = {}
    previous_time = time.time()
    for key in gamestates_to_solve:
        gamestate_to_solve = gamestates_to_solve[key]
        counter += 1
        new_percentage = math.floor(10 * counter / len(gamestates_to_solve))
        new_time = time.time()
        if (new_percentage > percentage):
            percentage = new_percentage
            print("    - {}%: ".format(10 * percentage), counter, "/", len(list(gamestates_to_solve)))
        elif new_time - previous_time > 30:
            print("    - {}%: ".format(10 * percentage), counter, "/", len(list(gamestates_to_solve)))
        
        if draft_stage_to_solve == utilities.DraftStage.select_defender:
            strategy = games.select_defender(n, gamestate_to_solve, lower_level_strategies)
        elif draft_stage_to_solve == utilities.DraftStage.select_attackers:
            strategy = games.select_attackers(n, gamestate_to_solve, lower_level_strategies)
        elif draft_stage_to_solve == utilities.DraftStage.discard_attackers:
            strategy = games.discard_attacker(pairing_dictionary, n, gamestate_to_solve, lower_level_strategies)
        else:
            raise ValueError("Unsolvavle draft stage: {}.".format(draft_stage_to_solve))       

        draft_stage_strategies[gamestate_to_solve.get_key()] = [list(strategy[0]), list(strategy[1]), strategy[2]]
        previous_time = new_time

    return draft_stage_strategies

def get_previous_strategy_dictionary(strategy_dictionary):
    strategy_dictionary_descriptor = strategy_dictionary['descriptor']
    n = strategy_dictionary_descriptor[0]
    draft_stage = strategy_dictionary_descriptor[0]

    previous_draft_stage = utilities.get_previous_draft_stage(draft_stage)

    if (previous_draft_stage == utilities.DraftStage.none):
        previous_draft_stage = utilities.DraftStage.discard_attackers
        n += 2

        if n > 8:
            return None

    previous_strategy_dictionary_name = utilities.get_strategy_dictionary_name(n, previous_draft_stage)
    previous_strategy_dictionary = dictionaries[previous_strategy_dictionary_name]

    return previous_strategy_dictionary