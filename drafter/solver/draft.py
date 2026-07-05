from random import random  # standard libraries
import itertools
from copy import deepcopy

import drafter.common.utilities as utilities  # local source
import drafter.common.team_permutation as team_permutation
from drafter.common.game_state import GameState
import drafter.common.draft_stage as draft_stage
from drafter.common.draft_stage import DraftStage
from drafter.common.pairing import Defender
import drafter.solver.strategy_dictionaries as strategy_dictionaries
import drafter.solver.game_state_dictionaries as game_state_dictionaries

keyword_quit = "quit()"
keyword_back = "back()"


# --- presentation helpers: the engine works in integer indices, names live only
# here (GitHub issue #13, B2) ---

def format_team_permutation(name_index, tp):
    parts = []
    if tp.defender is not None:
        parts.append("{{Defender: {}}}".format(name_index.name(tp.defender)))
    if tp.attacker_A is not None:
        parts.append("{{Attacker A: {}}}".format(name_index.name(tp.attacker_A)))
    if tp.attacker_B is not None:
        parts.append("{{Attacker B: {}}}".format(name_index.name(tp.attacker_B)))
    if tp.discarded_attacker is not None:
        parts.append("{{Discarded attacker: {}}}".format(name_index.name(tp.discarded_attacker)))
    parts.append("{{Remaining players: {}}}".format(
        ", ".join(name_index.name(i) for i in tp.remaining_players)))
    return ", ".join(parts)


def format_gamestate(ctx, gamestate, leading_whitespace=""):
    return "{}Friends: {}\n{}Enemies: {}".format(
        leading_whitespace, format_team_permutation(ctx.friendly, gamestate.friendly_team_permutation),
        leading_whitespace, format_team_permutation(ctx.enemy, gamestate.enemy_team_permutation))


# A (rounded value, "Friend vs Enemy" label) pairing, with " (D)" on whichever
# side defended. friendly_index/enemy_index are per-side player indices.
def pairing_string(ctx, friendly_index, enemy_index, defender=None):
    value = ctx.pairing.value(friendly_index, enemy_index, defender)
    friendly_player_string = ctx.friendly.name(friendly_index)
    enemy_player_string = ctx.enemy.name(enemy_index)

    if defender == Defender.FRIENDLY:
        friendly_player_string += " (D)"
    elif defender == Defender.ENEMY:
        enemy_player_string += " (D)"

    return round(value, 2), "{} vs {}".format(friendly_player_string, enemy_player_string)


def play_draft(ctx):
    print("\nPlaying draft against {}!\n".format(ctx.enemy_team_name))
    pairings = []
    current_gamestate = game_state_dictionaries.get_initial_game_state(ctx)
    gamestate_tree = [current_gamestate]
    step_pairing_counts = []
    draft_finished = False

    while True:
        next_draft_stage = draft_stage.get_next_draft_stage(current_gamestate.draft_stage)
        
        display_draft_stage = next_draft_stage
        if (ctx.config.invert_discard_attackers and display_draft_stage == DraftStage.discard_attacker):
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
        print('\n' + format_gamestate(ctx, current_gamestate, "      ") + '\n')
        team_strategies = get_team_strategies(ctx, current_gamestate)
        current_gamestate, new_pairings = prompt_next_gamestate(ctx, current_gamestate, team_strategies, next_draft_stage)

        if current_gamestate == keyword_quit:
            break
        elif (current_gamestate == keyword_back):
            if (len(gamestate_tree) > 1):
                gamestate_tree.pop()
                reverted_pairings_count = step_pairing_counts.pop()
                if reverted_pairings_count > 0:
                    del pairings[-reverted_pairings_count:]
            current_gamestate = gamestate_tree[-1]
        else:
            gamestate_tree.append(current_gamestate)
            step_pairing_counts.append(len(new_pairings))

            if len(new_pairings) > 0:
                pairings.extend(new_pairings)

        if current_gamestate is None:
            draft_finished = True
            break

    if draft_finished:
        print("\nDraft vs. {} finished!\n".format(ctx.enemy_team_name))
        print("Pairings:")
        for new_pairings in pairings:
            print(" - [{}]: {}".format(new_pairings[0], new_pairings[1]))
        result_sum = sum([pairing[0] for pairing in pairings])
        print("\nTotal: {}".format(round(result_sum, 2)))
        expected_result = strategy_dictionaries.game_value(ctx, gamestate_tree[0])
        print("Expected result: {}".format(round(expected_result, 2)))
        difference = result_sum - expected_result
        print("Difference: {}".format(round(difference, 2)))

        if difference > 0:
            winner = ctx.config.friendly_team_name
        else:
            winner = ctx.enemy_team_name

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

    return draft_finished


def get_team_strategies(ctx, _gamestate):
    # Recompute the labelled strategy for the visited gamestate on demand from its
    # children's values (GitHub issue #13, B3). The same recursion transparently
    # solves any off-tree, non-k-restricted subtree the user navigates into.
    return strategy_dictionaries.game_strategy(ctx, _gamestate)


def prompt_next_gamestate(ctx, _gamestate, gamestate_team_strategies, next_draft_stage):
    def print_team_options(team_name, team_permutation, team_strategy, opponent_team_permutation,
            show_suggestions, name_index, opponent_name_index):
        print("")
        # During the discard stage a team chooses among the OPPONENT's attackers,
        # so its options and strategy entries live in the opponent's index space.
        choice_name_index = opponent_name_index if next_draft_stage == DraftStage.discard_attacker else name_index

        if next_draft_stage == DraftStage.select_defender:
            option_indices = team_permutation.remaining_players
        elif next_draft_stage == DraftStage.select_attackers:
            option_indices = team_permutation.remaining_players
        elif next_draft_stage == DraftStage.discard_attacker:
            option_indices = [opponent_team_permutation.attacker_A, opponent_team_permutation.attacker_B]
        else:
            raise ValueError("Cannot solve draft stage {}".format(next_draft_stage))

        options = [choice_name_index.name(index) for index in option_indices]

        # Resolve the strategy's integer selections to names so the rest of this
        # display/sampling logic can stay name-based, as it was before B2.
        def to_name(selection):
            if isinstance(selection, list):
                return [choice_name_index.name(selection[0]), choice_name_index.name(selection[1])]
            return choice_name_index.name(selection)

        team_strategy = [[to_name(entry[0]), entry[1]] for entry in team_strategy]

        options_string = utilities.list_to_string(options)

        if next_draft_stage == DraftStage.select_attackers:
            options_string += "\n   Choose two. Format: 'Alice & Bob'"
            option_combinations = itertools.combinations(options, 2)
            options = ["{} & {}".format(option[0], option[1]) for option in option_combinations]

        if ctx.config.invert_discard_attackers and next_draft_stage == DraftStage.discard_attacker:
            print("   {} options: {} vs\n    - {}\n".format(
                team_name, name_index.name(team_permutation.defender), options_string))
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
                if ctx.config.invert_discard_attackers and next_draft_stage == DraftStage.discard_attacker:
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

        if ctx.config.invert_discard_attackers:
            if next_draft_stage == DraftStage.discard_attacker:
                attacker_A_name = choice_name_index.name(opponent_team_permutation.attacker_A)
                attacker_B_name = choice_name_index.name(opponent_team_permutation.attacker_B)
                if suggested_selection == attacker_A_name:
                    suggested_selection = attacker_B_name
                elif suggested_selection == attacker_B_name:
                    suggested_selection = attacker_A_name

        if (show_suggestions):
            print("\n    --- Suggested {} selection: {} ---\n".format(team_name, suggested_selection))

        return options, suggested_selection

    def prompt_team_selection(team_name, team_options, suggested_selection):
        user_selection = None

        while (user_selection is None) or (user_selection not in team_options):
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

        if ctx.config.invert_discard_attackers:
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
            next_friendly_team_permutation.select_defender(ctx.friendly.index(friendly_team_selection))
            next_enemy_team_permutation.select_defender(ctx.enemy.index(enemy_team_selection))

        elif next_gamestate_draft_stage == DraftStage.select_attackers:
            f_attacker_A, f_attacker_B = friendly_team_selection.split(" & ")
            next_friendly_team_permutation.select_attackers(
                ctx.friendly.index(f_attacker_A), ctx.friendly.index(f_attacker_B))

            e_attacker_A, e_attacker_B = enemy_team_selection.split(" & ")
            next_enemy_team_permutation.select_attackers(
                ctx.enemy.index(e_attacker_A), ctx.enemy.index(e_attacker_B))

        elif next_gamestate_draft_stage == DraftStage.discard_attacker:
            # Each team refuses one of the OPPONENT's attackers, so the friendly
            # selection is an enemy-space name and vice versa. The attacker a team
            # discards from its own pool is the one the opponent refused.
            f_discarded_attacker = ctx.friendly.index(enemy_team_selection)
            e_discarded_attacker = ctx.enemy.index(friendly_team_selection)

            next_friendly_team_permutation.select_discarded_attacker(f_discarded_attacker)
            next_friendly_team_permutation = team_permutation.get_none_team_permutation(next_friendly_team_permutation)

            next_enemy_team_permutation.select_discarded_attacker(e_discarded_attacker)
            next_enemy_team_permutation = team_permutation.get_none_team_permutation(next_enemy_team_permutation)

            f_defender = friendly_team_permutation.defender
            f_nondiscarded_attacker = friendly_team_permutation.get_nondiscarded_attacker(f_discarded_attacker)
            f_remaining_players = friendly_team_permutation.remaining_players

            e_defender = enemy_team_permutation.defender
            e_nondiscarded_attacker = enemy_team_permutation.get_nondiscarded_attacker(e_discarded_attacker)
            e_remaining_players = enemy_team_permutation.remaining_players

            pairings.append(pairing_string(ctx, f_defender, e_nondiscarded_attacker, Defender.FRIENDLY))
            pairings.append(pairing_string(ctx, f_nondiscarded_attacker, e_defender, Defender.ENEMY))

            if len(f_remaining_players) == 1:
                pairings.append(pairing_string(ctx, f_discarded_attacker, e_discarded_attacker))
                pairings.append(pairing_string(ctx, f_remaining_players[0], e_remaining_players[0]))

            next_gamestate_draft_stage = draft_stage.get_next_draft_stage(next_gamestate_draft_stage)

        else:
            raise ValueError("Cannot set gamestate stage {}".format(next_gamestate_draft_stage))

        next_gamestate = GameState(next_gamestate_draft_stage, next_friendly_team_permutation, next_enemy_team_permutation)

        return next_gamestate, pairings

    friendly_team_permutation = _gamestate.friendly_team_permutation
    enemy_team_permutation = _gamestate.enemy_team_permutation

    friendly_team_strategy = gamestate_team_strategies[0]
    enemy_team_strategy = gamestate_team_strategies[1]

    friendly_team_options, suggested_friendly_selection = print_team_options(ctx.config.friendly_team_name,
        friendly_team_permutation, friendly_team_strategy, enemy_team_permutation,
        ctx.config.show_friendly_strategy_suggestions, ctx.friendly, ctx.enemy)

    enemy_team_options, suggested_enemy_selection = print_team_options(ctx.enemy_team_name,
        enemy_team_permutation, enemy_team_strategy, friendly_team_permutation,
        ctx.config.show_enemy_strategy_suggestions, ctx.enemy, ctx.friendly)

    friendly_team_selection = None
    enemy_team_selection = None

    while friendly_team_selection is None or enemy_team_selection is None:
        friendly_team_selection = prompt_team_selection(ctx.config.friendly_team_name, friendly_team_options, suggested_friendly_selection)

        if friendly_team_selection is None or friendly_team_selection == keyword_quit or friendly_team_selection == keyword_back:
            return friendly_team_selection, []

        enemy_team_selection = prompt_team_selection(ctx.enemy_team_name, enemy_team_options, suggested_enemy_selection)

        if enemy_team_selection is None or enemy_team_selection == keyword_quit:
            return enemy_team_selection, []

        if enemy_team_selection == keyword_back:
            friendly_team_selection = None
            enemy_team_selection = None

    next_gamestate, new_pairings = get_next_gamestate()

    if next_gamestate.get_n() < 4:
        return None, new_pairings

    return next_gamestate, new_pairings