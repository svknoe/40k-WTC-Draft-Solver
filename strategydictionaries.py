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
dictionaries[utilities.get_strategy_dictionary_name(8, utilities.DraftStage.select_defender)] = {'descriptor':[8, utilities.DraftStage.select_defender]}
dictionaries[utilities.get_strategy_dictionary_name(8, utilities.DraftStage.select_attackers)] = {'descriptor':[8, utilities.DraftStage.select_attackers]}
dictionaries[utilities.get_strategy_dictionary_name(8, utilities.DraftStage.discard_attacker)] = {'descriptor':[8, utilities.DraftStage.discard_attacker]}
dictionaries[utilities.get_strategy_dictionary_name(6, utilities.DraftStage.select_defender)] = {'descriptor':[6, utilities.DraftStage.select_defender]}
dictionaries[utilities.get_strategy_dictionary_name(6, utilities.DraftStage.select_attackers)] = {'descriptor':[6, utilities.DraftStage.select_attackers]}
dictionaries[utilities.get_strategy_dictionary_name(6, utilities.DraftStage.discard_attacker)] = {'descriptor':[6, utilities.DraftStage.discard_attacker]}
dictionaries[utilities.get_strategy_dictionary_name(4, utilities.DraftStage.select_defender)] = {'descriptor':[4, utilities.DraftStage.select_defender]}
dictionaries[utilities.get_strategy_dictionary_name(4, utilities.DraftStage.select_attackers)] = {'descriptor':[4, utilities.DraftStage.select_attackers]}
dictionaries[utilities.get_strategy_dictionary_name(4, utilities.DraftStage.discard_attacker)] = {'descriptor':[4, utilities.DraftStage.discard_attacker]}

def initialise_dictionaries(match, read = True, write = True):
    def process_draft_stage(gamestate_dictionary_to_solve, lower_level_strategies = None):
        arbitrary_gamestate = utilities.get_arbitrarty_dictionary_entry(gamestate_dictionary_to_solve)
        strategy_dictionary_name = arbitrary_gamestate.get_strategy_dictionary_name()
        path = utilities.get_path(match, strategy_dictionary_name + ".json")

        draft_stage_strategies = None

        if read:
            draft_stage_strategies = utilities.read_strategy_dictionary(path)

        if draft_stage_strategies == None:
            draft_stage_strategies = get_strategy_dictionary(gamestate_dictionary_to_solve, lower_level_strategies)

            if write:
                utilities.write_strategy_dictionary(path, draft_stage_strategies)
        
        dictionaries[strategy_dictionary_name] = draft_stage_strategies

        return draft_stage_strategies

    initial_gamestate_dictionary_name = utilities.get_gamestate_dictionary_name(4, utilities.DraftStage.select_attackers)
    gamestate_dictionary = gamestatedictionaries.dictionaries[initial_gamestate_dictionary_name]

    strategy_dictionary = process_draft_stage(gamestate_dictionary)

    while strategy_dictionary != None:
        gamestate_dictionary = gamestatedictionaries.get_previous_gamestate_dictionary(gamestate_dictionary)

        if (gamestate_dictionary is None):
            break

        arbitrary_gamestate = utilities.get_arbitrarty_dictionary_entry(gamestate_dictionary)
        if (arbitrary_gamestate == None):
            break
        elif (arbitrary_gamestate.draft_stage == utilities.DraftStage.discard_attacker):
            gamestate_dictionary = gamestatedictionaries.get_previous_gamestate_dictionary(gamestate_dictionary)

        if (gamestate_dictionary is None):
            break

        strategy_dictionary = process_draft_stage(gamestate_dictionary, strategy_dictionary)

def extend_dictionary(new_gamestates_to_solve, lower_level_strategies):
    arbitrary_gamestate = new_gamestates_to_solve[list(new_gamestates_to_solve.keys())[0]]
    strategy_dictionary_name = arbitrary_gamestate.get_strategy_dictionary_name()

    strategies = get_strategy_dictionary(new_gamestates_to_solve, lower_level_strategies)
    dictionary_to_update = dictionaries[strategy_dictionary_name]
    dictionary_to_update.update(strategies)
        
    return strategies

def get_strategy_dictionary(gamestate_dictionary_to_solve, lower_level_strategies):
    arbitrary_gamestate = utilities.get_arbitrarty_dictionary_entry(gamestate_dictionary_to_solve)
    n = arbitrary_gamestate.get_n()
    draft_stage_to_solve = utilities.get_next_draft_stage(arbitrary_gamestate.draft_stage)

    if (not (n == 4 or n == 6 or n == 8)):
        sys.exit("{} is not a valid number of players. Choose 4, 6 or 8.".format(n))

    print(" - Generating {}-player {} strategies:".format(n, draft_stage_to_solve.name))
    counter = 0
    percentage = -1
    draft_stage_strategies = {}
    previous_time = time.time()
    for key in gamestate_dictionary_to_solve:
        gamestate_to_solve = gamestate_dictionary_to_solve[key]
        counter += 1
        new_percentage = math.floor(10 * counter / len(gamestate_dictionary_to_solve))
        new_time = time.time()
        if (new_percentage > percentage):
            percentage = new_percentage
            print("    - {}%: ".format(10 * percentage), counter, "/", len(list(gamestate_dictionary_to_solve)))
        elif new_time - previous_time > 30:
            print("    - {}%: ".format(10 * percentage), counter, "/", len(list(gamestate_dictionary_to_solve)))
        
        if draft_stage_to_solve == utilities.DraftStage.select_defender:
            strategy = games.select_defender(n, gamestate_to_solve, lower_level_strategies)
        elif draft_stage_to_solve == utilities.DraftStage.select_attackers:
            strategy = games.select_attackers(n, gamestate_to_solve, lower_level_strategies)
        elif draft_stage_to_solve == utilities.DraftStage.discard_attacker:
            strategy = games.discard_attacker(n, gamestate_to_solve, lower_level_strategies)
        else:
            raise ValueError("Unsolvavle draft stage: {}.".format(draft_stage_to_solve))       

        draft_stage_strategies[gamestate_to_solve.get_key()] = strategy
        previous_time = new_time

    return draft_stage_strategies

def get_previous_strategy_dictionary(strategy_dictionary):
    strategy_dictionary_descriptor = strategy_dictionary['descriptor']
    n = strategy_dictionary_descriptor[0]
    draft_stage = strategy_dictionary_descriptor[0]

    previous_draft_stage = utilities.get_previous_draft_stage(draft_stage)

    if (previous_draft_stage == utilities.DraftStage.none):
        previous_draft_stage = utilities.DraftStage.discard_attacker
        n += 2

        if n > 8:
            return None

    previous_strategy_dictionary_name = utilities.get_strategy_dictionary_name(n, previous_draft_stage)
    previous_strategy_dictionary = dictionaries[previous_strategy_dictionary_name]

    return previous_strategy_dictionary