import sys # standard libraries
import json
from pathlib import Path
from enum import Enum
from tokenize import Double

import nashpy # 3rd party packages

friendly_team_name = None
enemy_team_name = None

show_friendly_strategy_suggestions = True
show_enemy_strategy_suggestions = True

pairing_dictionary = {}
map_importance_dictionary = {}


class DraftStage(Enum):
    none, select_defender, select_attackers, discard_attacker = range(4)

def get_next_draft_stage(draft_stage):
    next_draft_stage = DraftStage((draft_stage.value + 1) % 4)
    return next_draft_stage

def get_previous_draft_stage(draft_stage):
    next_draft_stage = DraftStage((draft_stage.value - 1) % 4)
    return next_draft_stage

def initialise_input_dictionary(empty_input_dictionary, filename, hard_crash, encoding = {'--':-8, '-':-4, '0':0, '+':4, '++':8}):
    path = get_path(filename)

    try:
        with path.open(encoding="UTF-8") as f:
            lines = f.read().splitlines()
    except:
        if hard_crash:
            raise SystemError("Missing file: {}".format(path))
        else:
            print("Warning: Missing file: {}".format(path))
            return

    lines = [line for line in lines if line != ""]

    tmpLines = []
    for line in lines:
        if line.count('|') > 0:
            line = line.split('|')
        else:
            line = line.split()
        tmpLines.append(line)
    lines = tmpLines

    for line in lines:
        if (len(line) != len(lines[0])):
            print("The following line has a number of elements not equal to the number of elements in the first line:")
            print(line)
            sys.exit()

    matchups = []
    for i in range(2, len(lines)):
        matchups.append(lines[i])

    tmpMatchups = []
    for matchup in matchups:
        tmpMatchup = []
        for element in matchup:
            try:
                tmpMatchup.append(float(element))
            except ValueError:
                if element in encoding:
                    tmpMatchup.append(encoding[element])
                else:
                    error_message = "File {} contains unknown element {}. Use number values, specify encoding or use default encoding: {}.".format(path, element, encoding)
                    raise ValueError(error_message)
        tmpMatchups.append(tmpMatchup)
    matchups = tmpMatchups

    friends = lines[0]
    enemies = lines[1]

    for friend in friends:
        if friend in enemies:
            raise ValueError("Player {} present on both teams. All player names must be unique.".format(friend))

    friendCounter = 0
    for friend in friends:
        row = {}
        enemyCounter = 0
        for enemy in enemies:
            row[enemy] = matchups[friendCounter][enemyCounter]
            enemyCounter += 1
        empty_input_dictionary[friend] = row
        friendCounter += 1

def get_transposed_pairing_dictionary():
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
    if support_value != None:
        return support_value

    vertex_value = get_game_overview_from_equilibria(game, game.vertex_enumeration())
    if vertex_value != None:
        return vertex_value

    lemke_howson_value = get_game_overview_from_equilibria(game, game.lemke_howson_enumeration())
    if lemke_howson_value != None:
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

def print_overview(game_overview, roundTo = 3):
    round_row_strategy = [round(x, roundTo) for x in game_overview[0]]
    round_column_strategy = [round(x, roundTo) for x in game_overview[1]]
    round_value = round(game_overview[2], roundTo)
    print("Row strategy: ", round_row_strategy)
    print("Column strategy: ", round_column_strategy)
    print("Value: ", round_value)

def get_path(filename):
    if enemy_team_name == None:
        path = Path(__file__).parent / (filename)
    else:
        subfolder = "Matches/" + enemy_team_name
        path = Path(__file__).parent / (subfolder + "/" + filename)

    return path

def read_dictionary(path):
    try:
        with path.open('r', encoding='utf-8') as data_file:    
            print("   Reading file {} ...".format(path))
            dictionary = json.load(data_file)
            print('       ...done.') 

        return dictionary
    except:
        return None

def write_dictionary(path, dictionary):
    with path.open('w', encoding='utf-8') as f:
        print("   Writing file {} ...".format(path))
        json.dump(dictionary, f, ensure_ascii=False, indent=4)
        print('       ...done.') 
    
def get_empty_matrix(n, m):
    empty_matrix = { (i,j):None for i in range(n) for j in range(m)}
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

    dictionary_name =  "{}_{}_player_{}_dictionary".format(dictionary_type, n, draft_stage.name)

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

def get_pairing_value(n, friendly_player, enemy_player, defender = None):
    value = get_value_from_input_dictionary(pairing_dictionary, friendly_player, enemy_player)

    if len(map_importance_dictionary) > 0 and defender != None:
        if n == 8:
            map_importance_multiplier = 1
        elif n == 6:
            map_importance_multiplier = 0.6
        elif n == 4:
            map_importance_multiplier = 0.2
        else:
            raise ValueError("Incorrect n: {}. Must be 4, 6 or 8.".format(n))

        map_importance_entry = get_value_from_input_dictionary(map_importance_dictionary, friendly_player, enemy_player)
        map_importance = map_importance_multiplier * map_importance_entry

        if friendly_player == defender:
            value += map_importance
        elif enemy_player == defender:
            value -= map_importance
        else:
            raise ValueError("Unknown defender: {}".format(defender))

    return value        

def get_pairing_string(n, friendly_player, enemy_player, defender = None):
    value = get_pairing_value(n, friendly_player, enemy_player, defender)

    friendly_player_string = friendly_player
    enemy_player_string = enemy_player

    if defender != None:
        if friendly_player == defender:
            friendly_player_string += " (D)"
        elif enemy_player == defender:
            enemy_player_string += " (D)"
        else:
            raise ValueError("Unknown defender: {}".format(defender))

    return round(value, 2), "{} vs {}".format(friendly_player_string, enemy_player_string)