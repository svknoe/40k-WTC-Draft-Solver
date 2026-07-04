from pathlib import Path  # standard libraries
from enum import Enum

import nashpy  # 3rd party packages

import drafter.data.match_info as match_info  # local source
import drafter.data.settings as settings


def get_transposed_pairing_dictionary(pairing_dictionary):
    friends = [friend for friend in pairing_dictionary]
    enemies = [enemy for enemy in pairing_dictionary[friends[0]]]

    transposed_pairing_dictionary = {}

    for enemy in enemies:
        row = {}
        for friend in friends:
            row[friend] = pairing_dictionary[friend][enemy]
        transposed_pairing_dictionary[enemy] = row

    return transposed_pairing_dictionary


def get_game_solution(game):
    support_value = get_game_overview_from_equilibria(game, game.support_enumeration())
    if support_value is not None:
        return support_value

    vertex_value = get_game_overview_from_equilibria(game, game.vertex_enumeration())
    if vertex_value is not None:
        return vertex_value

    lemke_howson_value = get_game_overview_from_equilibria(game, game.lemke_howson_enumeration())
    if lemke_howson_value is not None:
        return lemke_howson_value

    return None


def get_game_strategy(game_solution_cache, game_array, friendly_team_options, enemy_team_options):
    game_array_hash = hash(game_array.tostring())

    if game_array_hash in game_solution_cache:
        game_solution = game_solution_cache[game_array_hash]
    else:
        game = nashpy.Game(game_array)
        game_solution = get_game_solution(game)
        game_solution_cache[game_array_hash] = game_solution

    game_strategy = [[], [], game_solution[2]]

    if (len(friendly_team_options) != len(game_solution[0])):
        raise ValueError("Inconsistent friendly team options.")

    for i in range(0, len(friendly_team_options)):
        game_strategy[0].append([friendly_team_options[i], round(game_solution[0][i], 3)])

    if (len(enemy_team_options) != len(game_solution[1])):
        raise ValueError("Inconsistent enemy team options.")

    for i in range(0, len(enemy_team_options)):
        game_strategy[1].append([enemy_team_options[i], round(game_solution[1][i], 3)])

    return game_strategy


# Returns overview of first equilibrium.
def get_game_overview_from_equilibria(game, equilibria):
    for equilibrium in equilibria:
        row_strategy = equilibrium[0]
        column_strategy = equilibrium[1]

        try:
            value = game[row_strategy, column_strategy][0]
        except:
            print(game)
            print(row_strategy)
            print(column_strategy)
            raise SystemError()
        return [row_strategy, column_strategy, value]

    return None


def print_overview(game_overview, roundTo=3):
    round_row_strategy = [round(x, roundTo) for x in game_overview[0]]
    round_column_strategy = [round(x, roundTo) for x in game_overview[1]]
    round_value = round(game_overview[2], roundTo)
    print("Row strategy: ", round_row_strategy)
    print("Column strategy: ", round_column_strategy)
    print("Value: ", round_value)


def get_path(filename):
    drafter_path = Path(__file__).parent.parent

    if match_info.enemy_team_name is None:
        path = drafter_path / (filename)
    else:
        subfolder = "resources/matches/" + match_info.enemy_team_name
        path = drafter_path / (subfolder + "/" + filename)

    return path


def get_empty_matrix(n, m):
    empty_matrix = {(i, j): None for i in range(n) for j in range(m)}
    return empty_matrix


def get_cartesian_product(list_A, list_B):
    cartesian_product = get_empty_matrix(len(list_A), len(list_B))

    for i in range(0, len(list_A)):
        for j in range(0, len(list_B)):
            cartesian_product[(i, j)] = [list_A[i], list_B[j]]

    return cartesian_product


def list_to_string(input_list):
    output_string = ""

    for i in range(0, len(input_list) - 1):
        output_string += input_list[i] + ", "

    output_string += input_list[len(input_list) - 1]

    return output_string


def get_gamestate_dictionary_name(n, draft_stage):
    return get_dictionary_name(n, draft_stage, "gamestate")


def get_strategy_dictionary_name(n, draft_stage):
    return get_dictionary_name(n, draft_stage, "strategy")


def get_dictionary_name(n, draft_stage, dictionary_type):
    if not (n == 4 or n == 6 or n == 8):
        raise Exception("{} is no a legal entry for n. Choose 4, 6 or 8.".format(n))

    dictionary_name = "{}_{}_player_{}_dictionary".format(dictionary_type, n, draft_stage.name)

    return dictionary_name


def get_arbitrary_dictionary_entry(dictionary):
    dictionary_keys = list(dictionary.keys())

    if 'descriptor' in dictionary_keys:
        dictionary_keys.remove('descriptor')

    if (len(dictionary_keys) > 0):
        arbitrary_dictionary_entry = dictionary[dictionary_keys[0]]
        return arbitrary_dictionary_entry
    else:
        return None


def get_value_from_input_dictionary(input_dictionary, friendly_player, enemy_player):
    if friendly_player in input_dictionary:
        row = input_dictionary[friendly_player]
    else:
        raise ValueError("Unknown player: {}".format(friendly_player))

    if enemy_player in row:
        value = row[enemy_player]
    else:
        raise ValueError("Unknown player: {}".format(enemy_player))

    return value


# The defender picks the map (11th-edition rule, PLAN.md workstream C): a
# friendly defender gets the pairing's best-map value, an enemy defender
# forces the worst-map value, and games without a defender (refused-vs-refused,
# last players) fall settings.neutral_map_weight of the way from worst to best.
def get_pairing_value(friendly_player, enemy_player, defender=None):
    best_value = get_value_from_input_dictionary(match_info.pairing_dictionary_best, friendly_player, enemy_player)
    worst_value = get_value_from_input_dictionary(match_info.pairing_dictionary_worst, friendly_player, enemy_player)

    if defender is None:
        return get_neutral_value(best_value, worst_value)
    elif friendly_player == defender:
        return best_value
    elif enemy_player == defender:
        return worst_value
    else:
        raise ValueError("Unknown defender: {}".format(defender))


def get_neutral_value(best_value, worst_value):
    return worst_value + settings.neutral_map_weight * (best_value - worst_value)


def get_pairing_string(friendly_player, enemy_player, defender=None):
    value = get_pairing_value(friendly_player, enemy_player, defender)

    friendly_player_string = friendly_player
    enemy_player_string = enemy_player

    if defender is not None:
        if friendly_player == defender:
            friendly_player_string += " (D)"
        elif enemy_player == defender:
            enemy_player_string += " (D)"
        else:
            raise ValueError("Unknown defender: {}".format(defender))

    return round(value, 2), "{} vs {}".format(friendly_player_string, enemy_player_string)