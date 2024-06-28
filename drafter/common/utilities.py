from pathlib import Path  # standard libraries
from enum import Enum

import nashpy  # 3rd party packages

import drafter.data.match_info as match_info  # local source


def get_transposed_pairing_dictionary():
    friends = [friend for friend in match_info.pairing_dictionary]
    enemies = [enemy for enemy in match_info.pairing_dictionary[friends[0]]]

    transposed_pairing_dictionary = {}

    for enemy in enemies:
        row = {}
        for friend in friends:
            row[friend] = match_info.pairing_dictionary[friend][enemy]
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


def get_pairing_value(n, friendly_player, enemy_player, defender=None):
    value = get_value_from_input_dictionary(match_info.pairing_dictionary, friendly_player, enemy_player)

    if len(match_info.map_importance_dictionary) > 0 and defender is not None:
        if n == 8:
            map_importance_multiplier = 1
        elif n == 6:
            map_importance_multiplier = 0.75
        elif n == 4:
            map_importance_multiplier = 0.5
        else:
            raise ValueError("Incorrect n: {}. Must be 4, 6 or 8.".format(n))

        map_importance_entry = get_value_from_input_dictionary(match_info.map_importance_dictionary, friendly_player, enemy_player)
        map_importance = map_importance_multiplier * map_importance_entry

        if friendly_player == defender:
            value += map_importance
        elif enemy_player == defender:
            value -= map_importance
        else:
            raise ValueError("Unknown defender: {}".format(defender))

    return value


def get_pairing_string(n, friendly_player, enemy_player, defender=None):
    value = get_pairing_value(n, friendly_player, enemy_player, defender)

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