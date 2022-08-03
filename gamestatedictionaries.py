import utilities # local source
import gamestate
from gamestate import GameState
from teampermutation import TeamPermutation

dictionaries = {}
dictionaries[utilities.get_gamestate_dictionary_name(8, utilities.DraftStage.none)] = {}
dictionaries[utilities.get_gamestate_dictionary_name(8, utilities.DraftStage.select_defender)] = {}
dictionaries[utilities.get_gamestate_dictionary_name(8, utilities.DraftStage.select_attackers)] = {}
dictionaries[utilities.get_gamestate_dictionary_name(8, utilities.DraftStage.discard_attacker)] = {}
dictionaries[utilities.get_gamestate_dictionary_name(6, utilities.DraftStage.none)] = {}
dictionaries[utilities.get_gamestate_dictionary_name(6, utilities.DraftStage.select_defender)] = {}
dictionaries[utilities.get_gamestate_dictionary_name(6, utilities.DraftStage.select_attackers)] = {}
dictionaries[utilities.get_gamestate_dictionary_name(6, utilities.DraftStage.discard_attacker)] = {}
dictionaries[utilities.get_gamestate_dictionary_name(4, utilities.DraftStage.none)] = {}
dictionaries[utilities.get_gamestate_dictionary_name(4, utilities.DraftStage.select_defender)] = {}
dictionaries[utilities.get_gamestate_dictionary_name(4, utilities.DraftStage.select_attackers)] = {}

def initialise_dictionaries():
    initial_game_state = get_initial_game_state()
    seed_dictionary = {'seed' : initial_game_state}
    extend_gamestate_tree_from_seed_dictionary(seed_dictionary)

def get_initial_game_state():
    friends = [friend for friend in utilities.pairing_dictionary]
    enemies = [enemy for enemy in utilities.pairing_dictionary[friends[0]]]
    initial_game_state = GameState(utilities.DraftStage.none, TeamPermutation(friends), TeamPermutation(enemies))

    return initial_game_state

def extend_gamestate_tree_from_seed_dictionary(parent_dictionary, new_gamestate_dictionaries = None):
    current_arbitrary_gamestate = utilities.get_arbitrarty_dictionary_entry(parent_dictionary)

    current_draft_stage = current_arbitrary_gamestate.draft_stage
    current_n = current_arbitrary_gamestate.get_n()

    if current_n == 4 and current_draft_stage == utilities.DraftStage.discard_attacker:
        return new_gamestate_dictionaries

    current_global_gamestate_dictionary_name = utilities.get_gamestate_dictionary_name(current_n, current_draft_stage)
    current_global_dictionary = dictionaries[current_global_gamestate_dictionary_name]

    if (current_global_dictionary == None):
        return new_gamestate_dictionaries

    parent_gamestates = [parent_dictionary[key] for key in parent_dictionary]
    added_subdictionary = add_gamestates_to_dictionary(current_global_dictionary, parent_gamestates)

    next_draft_stage = utilities.get_next_draft_stage(current_draft_stage)
    next_n = current_n

    next_global_gamestate_dictionary_name = utilities.get_gamestate_dictionary_name(next_n, next_draft_stage)

    print(" - Initialising {}...".format(next_global_gamestate_dictionary_name))

    generated_gamestate_dictionary = {}
    for parent_key in parent_dictionary:
        parent_gamestate = parent_dictionary[parent_key]
        child_gamestates = gamestate.get_next_gamestates(parent_gamestate)
        add_gamestates_to_dictionary(generated_gamestate_dictionary, child_gamestates)
    
    print("    - Done: {} gamestates".format(len(generated_gamestate_dictionary)))

    extend_gamestate_tree_from_seed_dictionary(generated_gamestate_dictionary, new_gamestate_dictionaries)

    if (new_gamestate_dictionaries != None):
        new_gamestate_dictionaries.append(added_subdictionary)
        return new_gamestate_dictionaries

def add_gamestates_to_dictionary(dictionary, gamestates):
    added_subdictionary = {}

    for gamestate in gamestates:
        key = gamestate.get_key()

        if not key in dictionary:
            dictionary[key] = gamestate
            added_subdictionary[key] = gamestate

    return added_subdictionary

def get_previous_gamestate_dictionary(gamestate_dictionary):
    arbitrary_gamestate = utilities.get_arbitrarty_dictionary_entry(gamestate_dictionary)
    n = arbitrary_gamestate.get_n()
    draft_stage = arbitrary_gamestate.draft_stage

    if n == 8 and draft_stage == utilities.DraftStage.none:
        return None

    previous_draft_stage = utilities.get_previous_draft_stage(draft_stage)

    if (previous_draft_stage == utilities.DraftStage.discard_attacker):
        n += 2

        if n > 10:
            return None

    next_gamestate_dictionary_name = utilities.get_gamestate_dictionary_name(n, previous_draft_stage)
    next_gamestate_dictionary = dictionaries[next_gamestate_dictionary_name]

    return next_gamestate_dictionary