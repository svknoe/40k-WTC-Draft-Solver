from random import random  # standard libraries
import itertools
from copy import deepcopy

import drafter.common.utilities as utilities  # local source
import drafter.common.team_permutation as team_permutation
from drafter.common.game_state import GameState
import drafter.common.draft_stage as draft_stage
from drafter.common.draft_stage import DraftStage
import drafter.data.settings as settings
import drafter.data.match_info as match_info
import drafter.solver.strategy_dictionaries as strategy_dictionaries
import drafter.solver.game_state_dictionaries as game_state_dictionaries

keyword_quit = "quit()"
keyword_back = "back()"


def play_draft():
    print("\nPlaying draft against {}!\n".format(match_info.enemy_team_name))
    pairings = []
    current_gamestate = game_state_dictionaries.get_initial_game_state()
    gamestate_tree = [current_gamestate]

    while True:
        next_draft_stage = draft_stage.get_next_draft_stage(current_gamestate.draft_stage)
        
        display_draft_stage = next_draft_stage
        if (settings.invert_discard_attackers and display_draft_stage == DraftStage.discard_attacker):
            display_draft_stage = "select enemy attacker"

        n = current_gamestate.get_n()
        print(("\n----------------------------------------------------------------------------------"
            + "-------------------\nDraft stage: {}-player {}\n").format(n, display_draft_stage))
        print("   Current gamestate:")
        if len(pairings) > 0:
            print("      Matches:")
            counter = 1
            for pairing in pairings:
                print("         " + "[{}] ".format(pairing[0]) + pairing[1])
        print('\n' + current_gamestate.get_key("      ") + '\n')
        team_strategies = get_team_strategies(current_gamestate)
        current_gamestate, new_pairings = prompt_next_gamestate(current_gamestate, team_strategies, next_draft_stage)

        if current_gamestate == keyword_quit:
            break
        elif (current_gamestate == keyword_back):
            if (len(gamestate_tree) > 1):
                gamestate_tree.pop()
            if (len(pairings) > 0):
                pairings.pop()
            current_gamestate = gamestate_tree[-1]
        else:
            gamestate_tree.append(current_gamestate)

            if len(new_pairings) > 0:
                pairings.extend(new_pairings)

        if current_gamestate is None:
            break

        update_dictionaries(current_gamestate)

    if len(pairings) == 8:
        print("\nDraft vs. {} finished!\n".format(match_info.enemy_team_name))
        print("Pairings:")
        for new_pairings in pairings:
            print(" - [{}]: {}".format(new_pairings[0], new_pairings[1]))
        result_sum = sum([pairing[0] for pairing in pairings])
        print("\nTotal: {}".format(round(result_sum, 2)))
        initial_strategy_dictionary_name = utilities.get_strategy_dictionary_name(8, DraftStage.select_defender)
        initial_strategy_dictionary = strategy_dictionaries.dictionaries[initial_strategy_dictionary_name]
        initial_strategy = utilities.get_arbitrary_dictionary_entry(initial_strategy_dictionary)
        expected_result = initial_strategy[2]
        print("Expected result: {}".format(round(expected_result, 2)))
        difference = result_sum - expected_result
        print("Difference: {}".format(round(difference, 2)))

        if difference > 0:
            winner = settings.friendly_team_name
        else:
            winner = match_info.enemy_team_name

        if abs(difference) <= 1:
            winner_message = "Draw"
        elif abs(difference) <= 4:
            winner_message = "Small win for {}".format(winner)
        elif abs(difference) <= 8:
            winner_message = "Win for {}".format(winner)
        else:
            winner_message = "Large win for {}".format(winner)

        print("\n - " + winner_message + "!\n")
    else:
        print("Draft aborted.")


def get_team_strategies(_gamestate):
    strategy_dictionary_name = _gamestate.get_strategy_dictionary_name()
    strategy_dictionary = strategy_dictionaries.dictionaries[strategy_dictionary_name]
    key = _gamestate.get_key()
    team_strategies = strategy_dictionary[key]
    return team_strategies


def update_dictionaries(seed_gamestate):
    seed_gamestate_dictionary_name = seed_gamestate.get_gamestate_dictionary_name()
    gamestate_dictionary = game_state_dictionaries.dictionaries[seed_gamestate_dictionary_name]
    seed_gamestate_key = seed_gamestate.get_key()

    if seed_gamestate_key not in gamestate_dictionary:
        print("\nUnexpected selection made. Extending game dictionaries...")

        added_gamestate_dictionaries = game_state_dictionaries.perform_gamestate_tree_extension(
            {seed_gamestate_key: seed_gamestate}, [])

        gamestate_dictionaries_to_process = []
        for i in range(0, len(added_gamestate_dictionaries)):
            gamestate_dictionary = added_gamestate_dictionaries[i]
            gamestate_dictionary_draft_stage = utilities.get_arbitrary_dictionary_entry(
                gamestate_dictionary).draft_stage

            if gamestate_dictionary_draft_stage != DraftStage.discard_attacker:
                gamestate_dictionaries_to_process.append(gamestate_dictionary)

        gamestate_dictionaries_to_process = list(reversed(gamestate_dictionaries_to_process))

        if len(gamestate_dictionaries_to_process) > 0:
            first_gamestate_dictionary = gamestate_dictionaries_to_process[0]
            first_arbitrary_gamestate = utilities.get_arbitrary_dictionary_entry(first_gamestate_dictionary)
            lower_level_strategies = strategy_dictionaries.get_dictionary_for_gamestate(first_arbitrary_gamestate)

            for gamestate_dictionary in gamestate_dictionaries_to_process:
                lower_level_strategies = strategy_dictionaries.process_gamestate_dictionary(
                    False, False, gamestate_dictionary, lower_level_strategies)


def prompt_next_gamestate(_gamestate, gamestate_team_strategies, next_draft_stage):
    def print_team_options(team_name, team_permutation, team_strategy, opponent_team_permutation, show_suggestions):
        print("")
        if next_draft_stage == DraftStage.select_defender:
            options = team_permutation.remaining_players
        elif next_draft_stage == DraftStage.select_attackers:
            options = team_permutation.remaining_players
        elif next_draft_stage == DraftStage.discard_attacker:
            options = [opponent_team_permutation.attacker_A, opponent_team_permutation.attacker_B]
        else:
            raise ValueError("Cannot solve draft stage {}".format(next_draft_stage))

        options_string = utilities.list_to_string(options)

        if next_draft_stage == DraftStage.select_attackers:
            options_string += "\n   Choose two. Format: 'Alice & Bob'"
            option_combinations = itertools.combinations(options, 2)
            options = ["{} & {}".format(option[0], option[1]) for option in option_combinations]

        if settings.invert_discard_attackers and next_draft_stage == DraftStage.discard_attacker:
            print("   {} options: {} vs\n    - {}\n".format(team_name, team_permutation.defender, options_string))
        else:
            print("   {} options:\n    - {}\n".format(team_name, options_string))

        if (show_suggestions):
            print("   Suggested strategy:")

        plausible_selections = [selection for selection in team_strategy if selection[1] > 1e-3]
        ranked_selections = sorted(plausible_selections, key=lambda k: (-1 * k[1]))

        for selection in ranked_selections:
            selection_probability = round(selection[1], 3)
            selection_player = selection[0]

            if isinstance(selection_player, list):
                selection_player = selection_player[0] + " & " + selection_player[1]

            if (show_suggestions):
                if settings.invert_discard_attackers and next_draft_stage == DraftStage.discard_attacker:
                    if selection_player == team_strategy[0][0]:
                        inverted_selection_player = team_strategy[1][0]
                    else:
                        inverted_selection_player = team_strategy[0][0]
                    print("      [p={}]: {}".format(selection_probability, inverted_selection_player))
                else:
                    print("      [p={}]: {}".format(selection_probability, selection_player))

        suggested_selection = None

        while suggested_selection is None:
            roll = random()

            for selection in ranked_selections:
                if roll < selection[1]:
                    suggested_selection = selection[0]

                    if isinstance(suggested_selection, list):
                        suggested_selection = suggested_selection[0] + " & " + suggested_selection[1]

                    break
                else:
                    roll -= selection[1]

        if settings.invert_discard_attackers:
            if next_draft_stage == DraftStage.discard_attacker:
                if suggested_selection == opponent_team_permutation.attacker_A:
                    suggested_selection = opponent_team_permutation.attacker_B
                elif suggested_selection == opponent_team_permutation.attacker_B:
                    suggested_selection = opponent_team_permutation.attacker_A

        if (show_suggestions):
            print("\n    --- Suggested {} selection: {} ---\n".format(team_name, suggested_selection))

        return options, suggested_selection

    def prompt_team_selection(team_name, team_options, suggested_selection):
        user_selection = None

        while (user_selection is None) or (user_selection not in team_options):
            print()
            user_selection = input(("Provide {} selection (press 'enter' for suggested default, "
                + "write '{}' to abort draft or '{}' to revert one step'):\n").format(team_name, keyword_quit, keyword_back))

            if user_selection == keyword_quit:
                return keyword_quit
            elif user_selection == keyword_back:
                return keyword_back
            elif (user_selection == ""):
                if isinstance(suggested_selection, str):
                    user_selection = suggested_selection
                elif isinstance(suggested_selection, list):
                    user_selection = suggested_selection[0] + " & " + suggested_selection[1]
                else:
                    raise ValueError("Incorrect user selection type (must be str or list): ", type(user_selection))
            else:
                if ("&" in user_selection and user_selection not in team_options):
                    split_selection = user_selection.split()
                    user_selection = split_selection[2] + " & " + split_selection[0]

                # Convert user selection to correct case.
                for option in team_options:
                    if option.upper() == user_selection.upper():
                        user_selection = option
                        break

        print(" - Selection made: {}".format(user_selection))

        if settings.invert_discard_attackers:
            if next_draft_stage == DraftStage.discard_attacker:
                if user_selection == team_options[0]:
                    user_selection = team_options[1]
                elif user_selection == team_options[1]:
                    user_selection = team_options[0]

        return user_selection

    def get_next_gamestate():
        next_gamestate_draft_stage = next_draft_stage
        next_friendly_team_permutation = deepcopy(friendly_team_permutation)
        next_enemy_team_permutation = deepcopy(enemy_team_permutation)
        pairings = []

        if next_gamestate_draft_stage == DraftStage.select_defender:
            next_friendly_team_permutation.select_defender(friendly_team_selection)
            next_enemy_team_permutation.select_defender(enemy_team_selection)

        elif next_gamestate_draft_stage == DraftStage.select_attackers:
            f_attacker_A, f_attacker_B = friendly_team_selection.split(" & ")
            next_friendly_team_permutation.select_attackers(f_attacker_A, f_attacker_B)

            e_attacker_A, e_attacker_B = enemy_team_selection.split(" & ")
            next_enemy_team_permutation.select_attackers(e_attacker_A, e_attacker_B)

        elif next_gamestate_draft_stage == DraftStage.discard_attacker:
            next_friendly_team_permutation.select_discarded_attacker(enemy_team_selection)
            next_friendly_team_permutation = team_permutation.get_none_team_permutation(next_friendly_team_permutation)

            next_enemy_team_permutation.select_discarded_attacker(friendly_team_selection)
            next_enemy_team_permutation = team_permutation.get_none_team_permutation(next_enemy_team_permutation)

            f_defender = friendly_team_permutation.defender
            f_discarded_attacker = enemy_team_selection
            f_nondiscarded_attacker = friendly_team_permutation.get_nondiscarded_attacker(f_discarded_attacker)
            f_remaining_players = friendly_team_permutation.remaining_players

            e_defender = enemy_team_permutation.defender
            e_discarded_attacker = friendly_team_selection
            e_nondiscarded_attacker = enemy_team_permutation.get_nondiscarded_attacker(e_discarded_attacker)
            e_remaining_players = enemy_team_permutation.remaining_players

            n = _gamestate.get_n()

            pairings.append(utilities.get_pairing_string(n, f_defender, e_nondiscarded_attacker, f_defender))
            pairings.append(utilities.get_pairing_string(n, f_nondiscarded_attacker, e_defender, e_defender))

            if len(f_remaining_players) == 1:
                pairings.append(utilities.get_pairing_string(n, f_discarded_attacker, e_discarded_attacker))
                pairings.append(utilities.get_pairing_string(n, f_remaining_players[0], e_remaining_players[0]))

            next_gamestate_draft_stage = draft_stage.get_next_draft_stage(next_gamestate_draft_stage)

        else:
            raise ValueError("Cannot set gamestate stage {}".format(next_gamestate_draft_stage))

        next_gamestate = GameState(next_gamestate_draft_stage, next_friendly_team_permutation, next_enemy_team_permutation)

        return next_gamestate, pairings

    friendly_team_permutation = _gamestate.friendly_team_permutation
    enemy_team_permutation = _gamestate.enemy_team_permutation

    friendly_team_strategy = gamestate_team_strategies[0]
    enemy_team_strategy = gamestate_team_strategies[1]

    friendly_team_options, suggested_friendly_selection = print_team_options(settings.friendly_team_name,
        friendly_team_permutation, friendly_team_strategy, enemy_team_permutation, settings.show_friendly_strategy_suggestions)

    enemy_team_options, suggested_enemy_selection = print_team_options(match_info.enemy_team_name,
        enemy_team_permutation, enemy_team_strategy, friendly_team_permutation, settings.show_enemy_strategy_suggestions)

    friendly_team_selection = None
    enemy_team_selection = None

    while friendly_team_selection is None or enemy_team_selection is None:
        friendly_team_selection = prompt_team_selection(settings.friendly_team_name, friendly_team_options, suggested_friendly_selection)

        if friendly_team_selection is None or friendly_team_selection == keyword_quit or friendly_team_selection == keyword_back:
            return friendly_team_selection, []

        enemy_team_selection = prompt_team_selection(match_info.enemy_team_name, enemy_team_options, suggested_enemy_selection)

        if enemy_team_selection is None or enemy_team_selection == keyword_quit:
            return enemy_team_selection, []

        if enemy_team_selection == keyword_back:
            friendly_team_selection = None
            enemy_team_selection = None

    next_gamestate, new_pairings = get_next_gamestate()

    if next_gamestate.get_n() < 4:
        return None, new_pairings

    return next_gamestate, new_pairings