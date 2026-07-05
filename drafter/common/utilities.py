from pathlib import Path  # standard libraries
from enum import Enum

import numpy as np  # 3rd party packages
from scipy.optimize import linprog

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


# Every game in the draft tree is zero-sum: the row (friendly) player maximises
# `game_array`, the column (enemy) player minimises it. Solve it directly rather
# than by nashpy's general-bimatrix support enumeration (issue #12 / PLAN.md B1):
# a pure saddle point when one exists, else a 2x2 closed form, else one small LP.
# All paths are deterministic and never emit nashpy's "degenerate game" warnings.
# Returns [row_strategy, column_strategy, value]; the value of a zero-sum game is
# unique even when multiple equilibrium strategies exist.
def get_game_solution(game_array):
    a = np.asarray(game_array, dtype=float)

    if a.shape == (2, 2):
        return solve_2x2_zero_sum_game(a)

    return solve_larger_zero_sum_game(a)


# Closed form for the 2x2 zero-sum game (the ~90% common case in the tree). A
# 2x2 zero-sum game is either fully mixed or has a pure saddle point. The mixed
# formula is tried first; if it yields a probability outside [0, 1] (or the
# denominator is zero) no interior equilibrium exists, so a saddle point does.
# `.tolist()` pulls the four entries out as Python floats in one call: the whole
# closed form is then plain-float arithmetic, far cheaper than repeated numpy
# scalar indexing over the ~200k distinct 2x2 games on the Scotland k=3 tree.
def solve_2x2_zero_sum_game(a):
    (a11, a12), (a21, a22) = a.tolist()

    denominator = a11 + a22 - a12 - a21

    if denominator != 0.0:
        row_probability = (a22 - a21) / denominator
        column_probability = (a22 - a12) / denominator

        if 0.0 <= row_probability <= 1.0 and 0.0 <= column_probability <= 1.0:
            value = (a11 * a22 - a12 * a21) / denominator
            return [[row_probability, 1.0 - row_probability],
                    [column_probability, 1.0 - column_probability],
                    value]

    return solve_2x2_saddle_point(a11, a12, a21, a22)


# No interior mixed equilibrium => a pure saddle point exists. The row
# (maximising) player plays the row with the largest row-minimum; the column
# (minimising) player plays the column with the smallest column-maximum. For a
# 2x2 zero-sum game these coincide at the saddle, whose entry is the value.
def solve_2x2_saddle_point(a11, a12, a21, a22):
    row_minima = [min(a11, a12), min(a21, a22)]
    best_row = 0 if row_minima[0] >= row_minima[1] else 1

    column_maxima = [max(a11, a21), max(a12, a22)]
    best_column = 0 if column_maxima[0] <= column_maxima[1] else 1

    row_strategy = [0.0, 0.0]
    row_strategy[best_row] = 1.0

    column_strategy = [0.0, 0.0]
    column_strategy[best_column] = 1.0

    value = [[a11, a12], [a21, a22]][best_row][best_column]

    return [row_strategy, column_strategy, value]


# Larger games: try a pure saddle point first, else one LP. The discrete rating
# scale leaves many games with a pure equilibrium -- on the Scotland k=3 tree
# ~half of the non-2x2 games do -- and detecting one costs two array reductions,
# far cheaper than an LP. A pure saddle exists iff the maximin (best row-minimum)
# equals the minimax (best column-maximum); that entry is then the game value.
def solve_larger_zero_sum_game(a):
    row_minima = a.min(axis=1)
    column_maxima = a.max(axis=0)

    best_row = int(row_minima.argmax())
    best_column = int(column_maxima.argmin())

    if row_minima[best_row] == column_maxima[best_column]:
        row_strategy = [0.0] * a.shape[0]
        row_strategy[best_row] = 1.0
        column_strategy = [0.0] * a.shape[1]
        column_strategy[best_column] = 1.0
        return [row_strategy, column_strategy, float(a[best_row, best_column])]

    return solve_zero_sum_game_by_linear_program(a)


# Solved games keyed by their translation-normalised (positivity-shifted) matrix.
# A zero-sum game's optimal strategies and its value are translation-invariant --
# adding a constant to every payoff shifts only the value -- so matrices that
# differ only by a constant, common on the discrete rating scale, share one LP
# solve. Cache the shifted matrix's solution (strategies + shifted value); each
# caller adds back its own shift. Complements the per-stage matrix-hash caches in
# games.py, which catch bit-identical (un-shifted) matrices.
normalised_game_solution_cache = {}


# The mixed larger game, by one linear program (scipy's HiGHS). Shift the payoff
# matrix to be strictly positive so the classic LP reformulation applies: the row
# maximiser solves  min 1.x  s.t.  A^T x >= 1, x >= 0, with game value = 1/sum x
# and row strategy = x * value. The column (minimising) player's strategy is the
# dual of that same LP -- scipy exposes it as the inequality-constraint marginals
# -- so one solve yields both sides; no need for the symmetric second LP. The
# shift is undone on the value. This is the formulation the independent oracle
# (scripts/brute_force_oracle.py) uses to cross-check golden values. Only the
# value propagates up the tree (games.get_game_array); the strategies are read
# solely by the interactive draft loop.
def solve_zero_sum_game_by_linear_program(a):
    shift = a.min()
    positive_a = a - shift + 1.0

    cache_key = hash(positive_a.tobytes())
    solution = normalised_game_solution_cache.get(cache_key)
    if solution is None:
        solution = solve_positivity_shifted_matrix_game(positive_a)
        normalised_game_solution_cache[cache_key] = solution

    row_strategy, column_strategy, shifted_value = solution

    return [row_strategy, column_strategy, shifted_value + shift - 1.0]


def solve_positivity_shifted_matrix_game(positive_a):
    row_count, column_count = positive_a.shape

    result = linprog(
        c=np.ones(row_count),
        A_ub=-positive_a.T,
        b_ub=-np.ones(column_count),
        bounds=(0, None),
        method="highs")

    if not result.success:
        raise RuntimeError("Zero-sum LP failed: {}".format(result.message))

    shifted_value = 1.0 / result.x.sum()
    row_strategy = list(result.x * shifted_value)

    # Dual solution: |marginals| of the column constraints is the column
    # player's optimal (unnormalised) mix; scaling by the value normalises it.
    column_strategy = list(np.abs(result.ineqlin.marginals) * shifted_value)

    return [row_strategy, column_strategy, shifted_value]


def get_game_strategy(game_solution_cache, game_array, friendly_team_options, enemy_team_options):
    game_array_hash = hash(game_array.tostring())

    if game_array_hash in game_solution_cache:
        row_probabilities, column_probabilities, value = game_solution_cache[game_array_hash]
    else:
        row_probabilities, column_probabilities, value = get_game_solution(game_array)
        # Round the mixed strategies once, when the matrix is first solved, rather
        # than on every one of the ~950k labelling passes that share these cached
        # solutions. Only the strategies are rounded; the value keeps full
        # precision because it is what propagates up the tree.
        row_probabilities = [round(probability, 3) for probability in row_probabilities]
        column_probabilities = [round(probability, 3) for probability in column_probabilities]
        game_solution_cache[game_array_hash] = [row_probabilities, column_probabilities, value]

    if len(friendly_team_options) != len(row_probabilities):
        raise ValueError("Inconsistent friendly team options.")

    if len(enemy_team_options) != len(column_probabilities):
        raise ValueError("Inconsistent enemy team options.")

    return [
        [[option, probability] for option, probability in zip(friendly_team_options, row_probabilities)],
        [[option, probability] for option, probability in zip(enemy_team_options, column_probabilities)],
        value,
    ]


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