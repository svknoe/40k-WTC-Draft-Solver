import sys # standard libraries
import json
from pathlib import Path
from enum import Enum

import nashpy # 3rd party packages

class DraftStage(Enum):
    none, defender_selected, attackers_selected, attacker_discarded = range(4)

def get_next_draft_stage(draft_stage):
    index_modulo = (draft_stage.value + 1) % 4
    index_max = max(1, index_modulo)
    return DraftStage(index_max)

def import_pairing_dictionary(match = None, filename = 'input_matrix.txt', encoding = {'--':-8, '-':-4, '0':0, '+':4, '++':8}):
    path = get_path(match, filename)
    with path.open(encoding="UTF-8") as f:
        lines = f.read().splitlines()

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
            tmpMatchup.append(encoding[element])
        tmpMatchups.append(tmpMatchup)
    matchups = tmpMatchups

    pairing_dictionary = {}

    friendCounter = 0
    for friend in lines[0]:
        row = {}
        enemyCounter = 0
        for enemy in lines[1]:
            row[enemy] = matchups[friendCounter][enemyCounter]
            enemyCounter += 1
        pairing_dictionary[friend] = row
        friendCounter += 1

    return pairing_dictionary

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

def get_game_overview(game):
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

def evaluate_game(metagame_cache, game_array, should_round_off_overview_values = False):
    game_hash = hash(game_array.tostring())

    if game_hash in metagame_cache:
        return metagame_cache[game_hash]
    else:
        game = nashpy.Game(game_array)
        game_overview = get_game_overview(game)

        if (should_round_off_overview_values):
            game_overview[0] = [round(p, 2) for p in game_overview[0]]
            game_overview[1] = [round(p, 2) for p in game_overview[1]]
            game_overview[2] = round(game_overview[2])

        metagame_cache[game_hash] = game_overview
        return game_overview

# Returns overview of first equilibrium.
def get_game_overview_from_equilibria(game, equilibria):
    for equilibrium in equilibria:
        row_strategy = equilibrium[0]
        column_strategy = equilibrium[1]
        value = game[row_strategy, column_strategy][0]
        return [row_strategy, column_strategy, value]

    return None

def print_overview(game_overview, roundTo = 3):
    round_row_strategy = [round(x, roundTo) for x in game_overview[0]]
    round_column_strategy = [round(x, roundTo) for x in game_overview[1]]
    round_value = round(game_overview[2], roundTo)
    print("Row strategy: ", round_row_strategy)
    print("Column strategy: ", round_column_strategy)
    print("Value: ", round_value)

def get_path(match, filename):
    if match == None:
        path = Path(__file__).parent / (filename)
    else:
        subfolder = "Matches/" + match
        path = Path(__file__).parent / (subfolder + "/" + filename)

    return path

def write_strategy_dictionary(path, strategy_dictionary):
    with path.open('w', encoding='utf-8') as f:
        print("Writing file {} ...".format(path))
        json.dump(strategy_dictionary, f, ensure_ascii=False, indent=4)
        print('    ...done.') 
    
def read_strategy_dictionary(path):
    try:
        with path.open() as data_file:    
            print("Reading file {} ...".format(path))
            strategy_dictionary = json.load(data_file)
            print('    ...done.') 

        return strategy_dictionary
    except:
        return None

def write_strategy_with_print_calls(match, strategy_dictionary, filename):
    strategy_path = get_path(match, filename)
    print("Writing file {} ...".format(strategy_path))
    write_strategy_dictionary(strategy_path, strategy_dictionary)
    print('    ...done.')

def get_empty_matrix(n, m):
    empty_matrix = { (i,j):None for i in range(len(n)) for j in range(len(m))}
    return empty_matrix

def get_cartesian_product(list_A, list_B):
    cartesian_product = get_empty_matrix(len(list_A), len(list_B))

    for i in range(0, len(list_A)):
        for j in range(0, len(list_B)):
            cartesian_product[(i, j)] = [list_A[i], list_B[j]]

    return cartesian_product