import math # standard libraries
import sys
import time

import utilities # local source
import games
import gamestate
from gamestate import GameState
import teampermutation
from teampermutation import TeamPermutation

eight_player_none_gamestate_dictionary = {}
eight_player_defender_gamestate_dictionary = {}
eight_player_attackers_gamestate_dictionary = {}
eight_player_discard_gamestate_dictionary = {}

six_player_none_gamestate_dictionary = {}
six_player_defender_gamestate_dictionary = {}
six_player_attackers_gamestate_dictionary = {}
six_player_discard_gamestate_dictionary = {}

four_player_none_gamestate_dictionary = {}
four_player_defender_gamestate_dictionary = {}
four_player_attackers_gamestate_dictionary = {}

dictionaries = {}
dictionaries[utilities.get_gamestate_dictionary_name(8, utilities.none)] = {'descriptor':[8, utilities.none]}
dictionaries[utilities.get_gamestate_dictionary_name(8, utilities.select_defender)] = {'descriptor':[8, utilities.select_defender]}
dictionaries[utilities.get_gamestate_dictionary_name(8, utilities.select_attackers)] = {'descriptor':[8, utilities.select_attackers]}
dictionaries[utilities.get_gamestate_dictionary_name(8, utilities.discard_attacker)] = {'descriptor':[8, utilities.discard_attacker]}
dictionaries[utilities.get_gamestate_dictionary_name(6, utilities.none)] = {'descriptor':[6, utilities.none]}
dictionaries[utilities.get_gamestate_dictionary_name(6, utilities.select_defender)] = {'descriptor':[6, utilities.select_defender]}
dictionaries[utilities.get_gamestate_dictionary_name(6, utilities.select_attackers)] = {'descriptor':[6, utilities.select_attackers]}
dictionaries[utilities.get_gamestate_dictionary_name(6, utilities.discard_attacker)] = {'descriptor':[6, utilities.discard_attacker]}
dictionaries[utilities.get_gamestate_dictionary_name(4, utilities.none)] = {'descriptor':[4, utilities.none]}
dictionaries[utilities.get_gamestate_dictionary_name(4, utilities.select_defender)] = {'descriptor':[4, utilities.select_defender]}
dictionaries[utilities.get_gamestate_dictionary_name(4, utilities.select_attackers)] = {'descriptor':[4, utilities.select_attackers]}

def initialise_dictionaries(pairing_dictionary, restrict_attackers):
    global eight_player_none_gamestate_dictionary, eight_player_discard_gamestate_dictionary, six_player_discard_gamestate_dictionary

    print("Initialising gamestate dictionaries:")

    initial_game_state = get_initial_game_state(pairing_dictionary)
    eight_player_none_gamestate_dictionary[initial_game_state.get_key()] = initial_game_state
    initialise_gamestate_dictionary(eight_player_defender_gamestate_dictionary, eight_player_none_gamestate_dictionary, "eight player defender gamestate dictionary")
    initialise_gamestate_dictionary(eight_player_attackers_gamestate_dictionary, eight_player_defender_gamestate_dictionary, "eight player attackers gamestate dictionary")
    initialise_gamestate_dictionary(eight_player_discard_gamestate_dictionary, eight_player_attackers_gamestate_dictionary, "tmp eight player discard gamestate dictionary")

    initialise_gamestate_dictionary(six_player_none_gamestate_dictionary, eight_player_discard_gamestate_dictionary, "six player non gamestate dictionary")
    if not restrict_attackers:
        eight_player_discard_gamestate_dictionary = None
    initialise_gamestate_dictionary(six_player_defender_gamestate_dictionary, six_player_none_gamestate_dictionary, "six player defender gamestate dictionary")
    initialise_gamestate_dictionary(six_player_attackers_gamestate_dictionary, six_player_defender_gamestate_dictionary, "six player attackers gamestate dictionary")
    initialise_gamestate_dictionary(six_player_discard_gamestate_dictionary, six_player_attackers_gamestate_dictionary, "tmp six player discard gamestate dictionary")

    initialise_gamestate_dictionary(four_player_none_gamestate_dictionary, six_player_discard_gamestate_dictionary, "four player non gamestate dictionary")
    if not restrict_attackers:
        six_player_discard_gamestate_dictionary = None
    initialise_gamestate_dictionary(four_player_defender_gamestate_dictionary, four_player_none_gamestate_dictionary, "four player defender gamestate dictionary")
    initialise_gamestate_dictionary(four_player_attackers_gamestate_dictionary, four_player_defender_gamestate_dictionary, "four player attackers gamestate dictionary")

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

def get_next_gamestate_dictionary(gamestate_dictionary):
    gamestate_dictionary_descriptor = gamestate_dictionary['descriptor']
    n = gamestate_dictionary_descriptor[0]
    draft_stage = gamestate_dictionary_descriptor[0]

    next_draft_stage = utilities.get_next_draft_stage(draft_stage)

    if (next_draft_stage == utilities.DraftStage.none):
        n -= 2

        if n < 4:
            return None

    next_gamestate_dictionary_name = utilities.get_gamestate_dictionary_name(n, next_draft_stage)
    next_gamestate_dictionary = dictionaries[next_gamestate_dictionary_name]

    return next_gamestate_dictionary

def get_previous_gamestate_dictionary(gamestate_dictionary):
    gamestate_dictionary_descriptor = gamestate_dictionary['descriptor']
    n = gamestate_dictionary_descriptor[0]
    draft_stage = gamestate_dictionary_descriptor[0]

    previous_draft_stage = utilities.get_previous_draft_stage(draft_stage)

    if (previous_draft_stage == utilities.DraftStage.discard_attacker):
        n += 2

        if n > 10:
            return None

    next_gamestate_dictionary_name = utilities.get_gamestate_dictionary_name(n, previous_draft_stage)
    next_gamestate_dictionary = dictionaries[next_gamestate_dictionary_name]

    return next_gamestate_dictionary