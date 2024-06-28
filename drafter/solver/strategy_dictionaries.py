import math  # standard libraries
import sys
import time

import drafter.common.utilities as utilities  # local source
import drafter.common.draft_stage as draft_stage
from drafter.common.draft_stage import DraftStage
import drafter.data.read_write as read_write
import drafter.solver.games as games
import drafter.solver.game_state_dictionaries as game_state_dictionaries

dictionaries = {}
dictionaries[utilities.get_strategy_dictionary_name(8, DraftStage.select_defender)] \
    = {'descriptor': [8, DraftStage.select_defender]}

dictionaries[utilities.get_strategy_dictionary_name(8, DraftStage.select_attackers)] \
    = {'descriptor': [8, DraftStage.select_attackers]}

dictionaries[utilities.get_strategy_dictionary_name(8, DraftStage.discard_attacker)] \
    = {'descriptor': [8, DraftStage.discard_attacker]}

dictionaries[utilities.get_strategy_dictionary_name(6, DraftStage.select_defender)] \
    = {'descriptor': [6, DraftStage.select_defender]}

dictionaries[utilities.get_strategy_dictionary_name(6, DraftStage.select_attackers)] \
    = {'descriptor': [6, DraftStage.select_attackers]}

dictionaries[utilities.get_strategy_dictionary_name(6, DraftStage.discard_attacker)] \
    = {'descriptor': [6, DraftStage.discard_attacker]}

dictionaries[utilities.get_strategy_dictionary_name(4, DraftStage.select_defender)] \
    = {'descriptor': [4, DraftStage.select_defender]}

dictionaries[utilities.get_strategy_dictionary_name(4, DraftStage.select_attackers)] \
    = {'descriptor': [4, DraftStage.select_attackers]}

dictionaries[utilities.get_strategy_dictionary_name(4, DraftStage.discard_attacker)] \
    = {'descriptor': [4, DraftStage.discard_attacker]}


def initialise_dictionaries(read, write):
    final_gamestate_dictionary_name = utilities.get_gamestate_dictionary_name(4, DraftStage.select_attackers)
    gamestate_dictionary = game_state_dictionaries.dictionaries[final_gamestate_dictionary_name]

    strategy_dictionary = process_gamestate_dictionary(read, write, gamestate_dictionary)

    while strategy_dictionary is not None:
        gamestate_dictionary = game_state_dictionaries.get_previous_gamestate_dictionary(gamestate_dictionary)

        if (gamestate_dictionary is None):
            break

        arbitrary_gamestate = utilities.get_arbitrary_dictionary_entry(gamestate_dictionary)
        if (arbitrary_gamestate is None):
            break
        elif (arbitrary_gamestate.draft_stage == DraftStage.discard_attacker):
            gamestate_dictionary = game_state_dictionaries.get_previous_gamestate_dictionary(gamestate_dictionary)

        if (gamestate_dictionary is None):
            break

        strategy_dictionary = process_gamestate_dictionary(read, write, gamestate_dictionary, strategy_dictionary)


def update_dictionaries(read, write, gamestate_dictionaries):
    reversed_gamestate_dictionaries = reversed(gamestate_dictionaries)
    lower_level_strategies = None

    for gamestate_dictionary in reversed_gamestate_dictionaries:
        arbitrary_gamestate = utilities.get_arbitrary_dictionary_entry(gamestate_dictionary)
        if arbitrary_gamestate.draft_stage == DraftStage.discard_attacker:
            continue

        lower_level_strategies = process_gamestate_dictionary(read, write, gamestate_dictionary, lower_level_strategies)


def process_gamestate_dictionary(read, write, gamestate_dictionary_to_solve, lower_level_strategies=None):
    arbitrary_gamestate = utilities.get_arbitrary_dictionary_entry(gamestate_dictionary_to_solve)
    strategy_dictionary_name = arbitrary_gamestate.get_strategy_dictionary_name()
    path = utilities.get_path(strategy_dictionary_name + ".json")

    draft_stage_strategies = None

    if read:
        draft_stage_strategies = read_write.read_dictionary(path)

    if draft_stage_strategies is None:
        draft_stage_strategies = get_strategy_dictionary(gamestate_dictionary_to_solve, lower_level_strategies)

        if write:
            read_write.write_dictionary(path, draft_stage_strategies)

    dictionaries[strategy_dictionary_name].update(draft_stage_strategies)

    return dictionaries[strategy_dictionary_name]


def get_strategy_dictionary(gamestate_dictionary_to_solve, lower_level_strategies):
    arbitrary_gamestate = utilities.get_arbitrary_dictionary_entry(gamestate_dictionary_to_solve)
    n = arbitrary_gamestate.get_n()
    draft_stage_to_solve = draft_stage.get_next_draft_stage(arbitrary_gamestate.draft_stage)

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
            previous_time = new_time
        elif new_time - previous_time > 30:
            print("    - {}%: ".format(round(100 * counter / len(gamestate_dictionary_to_solve), 1)),
                counter, "/", len(list(gamestate_dictionary_to_solve)))

            previous_time = new_time

        if draft_stage_to_solve == DraftStage.select_defender:
            strategy = games.select_defender(n, gamestate_to_solve, lower_level_strategies)
        elif draft_stage_to_solve == DraftStage.select_attackers:
            strategy = games.select_attackers(n, gamestate_to_solve, lower_level_strategies)
        elif draft_stage_to_solve == DraftStage.discard_attacker:
            strategy = games.discard_attacker(n, gamestate_to_solve, lower_level_strategies)
        else:
            raise ValueError("Unsolvavle draft stage: {}.".format(draft_stage_to_solve))

        draft_stage_strategies[gamestate_to_solve.get_key()] = strategy

    return draft_stage_strategies


def extend_dictionary(new_gamestates_to_solve, lower_level_strategies):
    arbitrary_gamestate = new_gamestates_to_solve[list(new_gamestates_to_solve.keys())[0]]
    strategy_dictionary_name = arbitrary_gamestate.get_strategy_dictionary_name()

    strategies = get_strategy_dictionary(new_gamestates_to_solve, lower_level_strategies)
    dictionary_to_update = dictionaries[strategy_dictionary_name]
    dictionary_to_update.update(strategies)

    return strategies


def get_previous_strategy_dictionary(strategy_dictionary):
    strategy_dictionary_descriptor = strategy_dictionary['descriptor']
    n = strategy_dictionary_descriptor[0]
    draft_stage = strategy_dictionary_descriptor[0]

    previous_draft_stage = draft_stage.get_previous_draft_stage(draft_stage)

    if (previous_draft_stage == DraftStage.none):
        previous_draft_stage = DraftStage.discard_attacker
        n += 2

        if n > 8:
            return None

    previous_strategy_dictionary_name = utilities.get_strategy_dictionary_name(n, previous_draft_stage)
    previous_strategy_dictionary = dictionaries[previous_strategy_dictionary_name]

    return previous_strategy_dictionary


def get_dictionary_for_gamestate(achieved_gamestate):
    n = achieved_gamestate.get_n()
    achieved_draft_stage = achieved_gamestate.draft_stage

    draft_stage_to_solve = draft_stage.get_next_draft_stage(achieved_draft_stage)
    if draft_stage_to_solve == DraftStage.none:
        draft_stage_to_solve = draft_stage.get_next_draft_stage(draft_stage_to_solve)

    supporting_draft_stage = draft_stage.get_next_draft_stage(draft_stage_to_solve)
    if supporting_draft_stage == DraftStage.none:
        supporting_draft_stage = draft_stage.get_next_draft_stage(supporting_draft_stage)

    if supporting_draft_stage.value < achieved_draft_stage.value:
        n -= 2

    if n < 4:
        return None

    for key in dictionaries:
        dictionary = dictionaries[key]
        descriptor = dictionary['descriptor']

        if n == descriptor[0] and supporting_draft_stage == descriptor[1]:
            return dictionary

    return None