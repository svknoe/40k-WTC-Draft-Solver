from ctypes import util
from operator import add
from random import random
import itertools
from copy import deepcopy

import utilities # local source
import strategydictionaries
import gamestatedictionaries
from gamestate import GameState
import teampermutation

def play_draft():
    print("\nPlaying draft against {}!\n".format(utilities.enemy_team_name))
    pairings = []
    current_gamestate = gamestatedictionaries.get_initial_game_state()

    while True:
        next_draft_stage = utilities.get_next_draft_stage(current_gamestate.draft_stage)
        n = current_gamestate.get_n()
        print("\n-----------------------------------------------------------------------------------------------------\nDraft stage: {}-player {}\n".format(n, next_draft_stage))
        print("Current gamestate:\n{}\n".format(current_gamestate.get_key()))
        team_strategies = get_team_strategies(current_gamestate)
        current_gamestate, new_pairings = prompt_next_gamestate(current_gamestate, team_strategies, next_draft_stage)

        if len(new_pairings) > 0:
            pairings.extend(new_pairings)
        
        if current_gamestate == None:
            break

        update_dictionaries(current_gamestate)
    
    if len(pairings) == 8:
        print("\nDraft vs. {} finished!\n".format(utilities.enemy_team_name))
        print("Pairings:")
        for new_pairings in pairings:
            print(" - [{}]: {}".format(new_pairings[0], new_pairings[1]))
        result_sum = sum([pairing[0] for pairing in pairings])
        print("\nTotal: {}".format(round(result_sum, 2)))
        initial_strategy_dictionary_name = utilities.get_strategy_dictionary_name(8, utilities.DraftStage.select_defender)
        initial_strategy_dictionary = strategydictionaries.dictionaries[initial_strategy_dictionary_name]
        initial_strategy = utilities.get_arbitrary_dictionary_entry(initial_strategy_dictionary)
        expected_result = initial_strategy[2]
        print("Expected result: {}".format(round(expected_result, 2)))
        difference = result_sum - expected_result
        print("Difference: {}".format(round(difference, 2)))
        
        if difference > 0:
            winner = utilities.friendly_team_name
        else:
            winner = utilities.enemy_team_name

        if abs(difference) <= 1:
            winner_message = "Draw"
        elif abs(difference) <= 4:
            winner_message = "Small win for {}".format(winner)
        elif abs(difference) <= 8:
            winner_message = "Win for {}".format(winner)
        else:
            winner_message = "Large win for {}".format(winner)

        print("\n" + winner_message)
    else:
        print("Draft aborted.")

def get_team_strategies(_gamestate):
    strategy_dictionary_name = _gamestate.get_strategy_dictionary_name()
    strategy_dictionary = strategydictionaries.dictionaries[strategy_dictionary_name]
    key = _gamestate.get_key()
    team_strategies = strategy_dictionary[key]
    return team_strategies

def update_dictionaries(seed_gamestate):
    seed_gamestate_dictionary_name = seed_gamestate.get_gamestate_dictionary_name()
    gamestate_dictionary = gamestatedictionaries.dictionaries[seed_gamestate_dictionary_name]
    seed_gamestate_key = seed_gamestate.get_key()

    if seed_gamestate_key not in gamestate_dictionary:
        print("\nUnexpected selection made. Extending game dictionaries...")
        added_gamestate_dictionaries = gamestatedictionaries.perform_gamestate_tree_extension({seed_gamestate_key : seed_gamestate}, [])

        gamestate_dictionaries_to_process = []
        for i in range(0, len(added_gamestate_dictionaries)):
            gamestate_dictionary = added_gamestate_dictionaries[i]
            gamestate_dictionary_draft_stage = utilities.get_arbitrary_dictionary_entry(gamestate_dictionary).draft_stage

            if gamestate_dictionary_draft_stage != utilities.DraftStage.discard_attacker:
                gamestate_dictionaries_to_process.append(gamestate_dictionary)

        gamestate_dictionaries_to_process = list(reversed(gamestate_dictionaries_to_process))

        if len(gamestate_dictionaries_to_process) > 0:
            first_gamestate_dictionary = gamestate_dictionaries_to_process[0]
            first_arbitrary_gamestate = utilities.get_arbitrary_dictionary_entry(first_gamestate_dictionary)
            lower_level_strategies = strategydictionaries.get_dictionary_for_gamestate(first_arbitrary_gamestate)

            for gamestate_dictionary in gamestate_dictionaries_to_process:
                lower_level_strategies = strategydictionaries.process_gamestate_dictionary(False, False, gamestate_dictionary, lower_level_strategies)

def prompt_next_gamestate(_gamestate, gamestate_team_strategies, next_draft_stage):
    def print_team_options(team_name, team_permutation, team_strategy, opponent_team_permutation, show_suggestions):
        print("")
        if next_draft_stage == utilities.DraftStage.select_defender:
            options = team_permutation.remaining_players
        elif next_draft_stage == utilities.DraftStage.select_attackers:
            options = team_permutation.remaining_players
        elif next_draft_stage == utilities.DraftStage.discard_attacker:
            options = [opponent_team_permutation.attacker_A, opponent_team_permutation.attacker_B]
        else:
            raise ValueError("Cannot solve draft stage {}".format(next_draft_stage))

        options_string = utilities.list_to_string(options)

        if next_draft_stage == utilities.DraftStage.select_attackers:
            options_string += "\n   Choose two. Format: 'Alice & Bob'"
            option_combinations = itertools.combinations(options, 2)
            options = ["{} & {}".format(option[0], option[1]) for option in option_combinations]

        print("   {} options:\n    - {}\n".format(team_name, options_string))

        if (show_suggestions):
            print("   Suggested strategy:")

        plausible_selections = [selection for selection in team_strategy if selection[1] > 1e-3]
        ranked_selections = sorted(plausible_selections , key=lambda k: (-1 * k[1]))

        for selection in ranked_selections:
            selection_probability = round(selection[1], 3)
            selection_player = selection[0]

            if type(selection_player) == list:
                selection_player = selection_player[0] + " & " + selection_player[1]

            if (show_suggestions):
                print("      [p={}]: {}".format(selection_probability, selection_player))

        suggested_selection = None

        while suggested_selection == None:
            roll = random()

            for selection in ranked_selections:
                if roll < selection[1]:
                    suggested_selection = selection[0]

                    if type(suggested_selection) == list:
                        suggested_selection = suggested_selection[0] + " & " + suggested_selection[1]

                    break
                else:
                    roll -= selection[1]

        if (show_suggestions):
            print("\n    --- Suggested {} selection: {} ---\n".format(team_name, suggested_selection))

        return options, suggested_selection

    def prompt_team_selection(team_name, team_options, suggested_selection):
        user_selection = None

        while (user_selection == None) or ((not user_selection.upper() in (option.upper() for option in team_options)) and (user_selection != "")): 
            user_selection = input("Provide {} selection (press 'enter' for suggested default, write 'quit()' to abort draft'):\n".format(team_name))

            if user_selection == "quit()":
                return None

            if ("&" in user_selection and not user_selection in team_options):
                split_selection = user_selection.split()
                user_selection = split_selection[2] + " & " + split_selection[0] # TODO whitespace management.

            if (user_selection == ""):
                if type(suggested_selection) == str:
                    user_selection = suggested_selection
                elif type(suggested_selection) == list:
                    user_selection = suggested_selection[0] + " & " + suggested_selection[1]
                else:
                    raise ValueError("Incorrect user selection type (must be str or list): ", type(user_selection))

        print(" - Selection made: {}".format(user_selection))

        return user_selection # TODO: Convert user selection to correct case.

    def get_next_gamestate():
        next_gamestate_draft_stage = next_draft_stage
        next_friendly_team_permutation = deepcopy(friendly_team_permutation)
        next_enemy_team_permutation = deepcopy(enemy_team_permutation)
        pairings = []

        if next_gamestate_draft_stage == utilities.DraftStage.select_defender:
            next_friendly_team_permutation.select_defender(friendly_team_selection)
            next_enemy_team_permutation.select_defender(enemy_team_selection)

        elif next_gamestate_draft_stage == utilities.DraftStage.select_attackers:
            f_attacker_A, f_attacker_B = friendly_team_selection.split(" & ")
            next_friendly_team_permutation.select_attackers(f_attacker_A, f_attacker_B)

            e_attacker_A, e_attacker_B = enemy_team_selection.split(" & ")
            next_enemy_team_permutation.select_attackers(e_attacker_A, e_attacker_B)

        elif next_gamestate_draft_stage == utilities.DraftStage.discard_attacker:
            next_friendly_team_permutation.select_discarded_attacker(enemy_team_selection)
            next_friendly_team_permutation = teampermutation.get_none_team_permutation(next_friendly_team_permutation)

            next_enemy_team_permutation.select_discarded_attacker(friendly_team_selection)
            next_enemy_team_permutation = teampermutation.get_none_team_permutation(next_enemy_team_permutation)

            f_defender =  friendly_team_permutation.defender
            f_discarded_attacker = enemy_team_selection
            f_nondiscarded_attacker = friendly_team_permutation.get_nondiscarded_attacker(f_discarded_attacker)
            f_remaining_players = friendly_team_permutation.remaining_players

            e_defender =  enemy_team_permutation.defender
            e_discarded_attacker = friendly_team_selection
            e_nondiscarded_attacker = enemy_team_permutation.get_nondiscarded_attacker(e_discarded_attacker)
            e_remaining_players = enemy_team_permutation.remaining_players

            n = _gamestate.get_n()

            pairings.append(utilities.get_pairing_string(n, f_defender, e_nondiscarded_attacker, f_defender))
            pairings.append(utilities.get_pairing_string(n, f_nondiscarded_attacker, e_defender, e_defender))

            if len(f_remaining_players) == 1:
                pairings.append(utilities.get_pairing_string(n, f_discarded_attacker, e_discarded_attacker))
                pairings.append(utilities.get_pairing_string(n, f_remaining_players[0], e_remaining_players[0]))

            next_gamestate_draft_stage = utilities.get_next_draft_stage(next_gamestate_draft_stage)

        else:
            raise ValueError("Cannot set gamestate stage {}".format(next_gamestate_draft_stage))

        next_gamestate = GameState(next_gamestate_draft_stage, next_friendly_team_permutation, next_enemy_team_permutation)

        return next_gamestate, pairings

    friendly_team_permutation = _gamestate.friendly_team_permutation
    enemy_team_permutation = _gamestate.enemy_team_permutation

    friendly_team_strategy = gamestate_team_strategies[0]
    enemy_team_strategy = gamestate_team_strategies[1]

    friendly_team_options, suggested_friendly_selection = print_team_options(utilities.friendly_team_name, friendly_team_permutation, friendly_team_strategy, enemy_team_permutation, utilities.show_friendly_strategy_suggestions)
    enemy_team_options, suggested_enemy_selection = print_team_options(utilities.enemy_team_name, enemy_team_permutation, enemy_team_strategy, friendly_team_permutation, utilities.show_enemy_strategy_suggestions)

    friendly_team_selection = prompt_team_selection(utilities.friendly_team_name, friendly_team_options, suggested_friendly_selection)
    if friendly_team_selection == None:
        return None, []

    enemy_team_selection = prompt_team_selection(utilities.enemy_team_name, enemy_team_options, suggested_enemy_selection)
    if enemy_team_selection == None:
        return teampermutation.get_none_team_permutation()

    next_gamestate, new_pairings = get_next_gamestate()

    if next_gamestate.get_n() < 4:
        return None, new_pairings

    return next_gamestate, new_pairings