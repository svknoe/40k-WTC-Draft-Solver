import time # standard libraries
from random import random
import itertools
from copy import deepcopy

import utilities # local source
import strategydictionaries
import gamestatedictionaries
from gamestate import GameState
import teampermutation

match = ""

# Settings
friendly_team_name = "Norway"
read = False
write = True
restrict_attackers = True
restricted_attackers_count = 2
round_strategies = False

strategy_dictionaries = {}

def run():
    global match
    match = "Germany" # Select match

    t0 = time.time()
    initialise()
    print("time: {}s".format(round(time.time() - t0, 2)))

    while True:
        play_draft()
        draft_again = prompt_draft_again()
        if not draft_again:
            break

def initialise():
    utilities.initialise_pairing_dictionary(match)

    if (restrict_attackers):
        teampermutation.enable_restricted_attackers(restricted_attackers_count)

    print("Initialising gamestate dictionaries:")
    gamestatedictionaries.initialise_dictionaries()

    print("Initialising strategy dictionaries:")
    strategydictionaries.initialise_dictionaries(match, read, write)

def prompt_draft_again():
    def valid_input(prompt_input):
        if prompt_input == "" or prompt_input == "y" or prompt_input == "n":
            return True

        return False

    user_input = None

    while not valid_input(user_input):
        user_input = input("Draft again? (y / [n])")

    if user_input == "y":
        return True

    return False

def play_draft():
    print("\nPlaying draft against {}!\n".format(match))
    current_gamestate = gamestatedictionaries.get_initial_game_state()

    while True:
        print("Current gamestate:\n{}\n".format(current_gamestate))
        team_strategies = get_team_strategies(current_gamestate)
        current_gamestate = prompt_next_gamestate(current_gamestate, team_strategies)
        
        if current_gamestate == None:
            print("Draft finished. Expected result:")
            break

        gamestate_dictionary = gamestatedictionaries.dictionaries[current_gamestate.get_gamestate_dictionary_name()]
        current_gamestate_key = gamestate_dictionary.get_key()

        if current_gamestate_key not in gamestate_dictionary:
            added_gamestate_dictionaries = gamestatedictionaries.extend_gamestate_tree_from_seed_dictionary({current_gamestate_key : current_gamestate}, [])
            print()

def get_team_strategies(_gamestate):
    strategy_dictionary_name = _gamestate.get_strategy_dictionary_name()
    strategy_dictionary = strategydictionaries.dictionaries[strategy_dictionary_name]
    team_strategies = strategy_dictionary[_gamestate.get_key()]
    return team_strategies

def prompt_next_gamestate(_gamestate, gamestate_team_strategies):
    def print_team_options(team_name, team_permutation, team_strategy):
        print("------------------------")
        if draft_stage == utilities.DraftStage.select_defender:
            options = team_permutation.remaining_players
        elif draft_stage == utilities.DraftStage.select_attackers:
            options = team_permutation.remaining_players
        elif draft_stage == utilities.DraftStage.discard_attacker:
            options = [team_permutation.attacker_A, team_permutation.attacker_B]
        else:
            raise ValueError("Cannot solve draft stage {}".format(draft_stage))

        options_string = utilities.list_to_string(options)

        if draft_stage == utilities.DraftStage.select_attackers:
            options_string += "\n    - Choose two. Format: 'Alice & Bob'"
            option_combinations = itertools.combinations(options, 2)
            options = ["{} & {}".format(option[0], option[1]) for option in option_combinations]

        print("{} options:\n - {}\n".format(team_name, options_string))

        print("Suggested random strategy:")

        plausible_selections = [selection for selection in team_strategy if selection[1] > 1e-3]
        ranked_selections = sorted(plausible_selections , key=lambda k: (-1 * k[1]))

        for selection in ranked_selections:
            selection_probability = round(selection[1], 3)
            selection_player = selection[0]
            print("[{}]: {}".format(selection_probability, selection_player))

        suggested_selection = None

        while suggested_selection == None:
            roll = random()

            for selection in plausible_selections:
                if roll < selection[1]:
                    suggested_selection = selection[0]
                    break
                else:
                    roll -= selection[1]

        print(" --- Suggested {} selection: {} ---\n".format(team_name, suggested_selection))
        print("------------------------\n")

        return options, suggested_selection

    def prompt_team_selection(team_name, team_options, suggested_selection):
        user_selection = None

        while (not user_selection in team_options) and (user_selection != ""):
            user_selection = input("Provide {team_name} selection (press 'enter' for suggested default, write 'quit()' to abort draft'):")

            if user_selection == "quit()":
                return None

            if ("&" in user_selection and not user_selection in team_options):
                split_selection = user_selection.split()
                user_selection = split_selection[2] + " & " + split_selection[0] # TODO whitespace management.

        if (user_selection == ""):
            user_selection = suggested_selection

        print("Selection made: {user_selection}")

        return user_selection

    def get_next_gamestate(friendly_team_permutation, friendly_enemy_permutation):
        next_gamestate_stage = draft_stage
        next_friendly_team_permutation = deepcopy(friendly_team_permutation)
        next_enemy_team_permutation = deepcopy(friendly_enemy_permutation)

        if next_gamestate_stage == utilities.DraftStage.select_defender:
            next_friendly_team_permutation.select_defender(friendly_team_selection)
            next_enemy_team_permutation.select_defender(enemy_team_selection)

        elif next_gamestate_stage == utilities.DraftStage.select_attackers:
            friendly_split_selection = friendly_team_selection.split()
            next_friendly_team_permutation.select_attackers(friendly_split_selection[0], friendly_split_selection[2])

            enemy_split_selection = enemy_team_selection.split()
            next_enemy_team_permutation.select_attackers(enemy_split_selection[0], enemy_split_selection[2])

        elif next_gamestate_stage == utilities.DraftStage.discard_attacker:
            next_friendly_team_permutation.discard_attacker(friendly_team_selection)
            next_friendly_team_permutation = teampermutation.get_none_team_permutation(next_friendly_team_permutation)

            next_enemy_team_permutation.discard_attacker(enemy_team_selection)
            next_enemy_team_permutation = teampermutation.get_none_team_permutation(next_enemy_team_permutation)

            next_gamestate_stage = utilities.get_next_draft_stage(next_gamestate_stage)

        else:
            raise ValueError("Cannot set gamestate stage {}".format(next_gamestate_stage))

        next_gamestate = GameState(next_gamestate_stage, next_friendly_team_permutation, next_enemy_team_permutation)

        return next_gamestate

    draft_stage = utilities.get_next_gamestate(_gamestate.draft_stage)
    print("Draft stage: {}".format(draft_stage))

    friendly_team_permutation = _gamestate.friendly_team_permutation
    enemy_team_permutation = _gamestate.enemy_team_permutation

    friendly_team_strategy = gamestate_team_strategies[0]
    enemy_team_strategy = gamestate_team_strategies[1]

    friendly_team_options = print_team_options(friendly_team_name, friendly_team_permutation, friendly_team_strategy)
    enemy_team_options = print_team_options(match, enemy_team_permutation, enemy_team_strategy)

    friendly_team_selection = prompt_team_selection(friendly_team_name, friendly_team_options)
    if friendly_team_selection == None:
        return None

    enemy_team_selection = prompt_team_selection(match, enemy_team_options)
    if enemy_team_selection == None:
        return teampermutation.get_none_team_permutation()

    next_gamestate = get_next_gamestate()

    if next_gamestate.get_n() < 4:
        return None

    return next_gamestate

run()