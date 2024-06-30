import csv
from loguru import logger
import numpy as np

from drafter.common import utilities
from drafter.store import store
from drafter.store.Gamestate import GameState
from drafter.utils.wrapper import timing


@timing
def init():
    store.pairing = initialize_input_dictionary("pairing_matrix.csv", True)
    store.map_importance = initialize_input_dictionary("map_importance_matrix.csv", False)

    if (store.settings.restrict_attackers):
        store.pairing.transposed_matrix = store.pairing.matrix.transpose()

    initialize_gamestates()

def initialize_input_dictionary(filename: str, hard_crash: bool):
    """
        This function reads the csv file and stores the values in the game_state object.
        It uses the encoding dictionary to convert the values to float.
    """
    encoding = {'--': -8.0, '-': -4.0, '0': 0.0, '+': 4.0, '++': 8.0}
    game_state = GameState()

    try:
        path = utilities.get_path(filename)
        with path.open(encoding="UTF-8") as file:
            table = csv.reader(file)

            allies = next(table)
            enemies = next(table)

            if store.settings.require_unique_names & any(ally in enemies for ally in allies):
                raise ValueError("Player present on both teams. All player names must be unique.")
            
            game_state.allies = allies
            game_state.enemies = enemies

            tmp_matrix: list[list[float]] = []

            for allyIndex, row in enumerate(table):
                if len(row) == 0:
                    continue

                if len(row) != len(game_state.allies):
                    logger.error("The following line has a number of elements not equal to the number of elements in the first line: \n {}", row)
                    raise ValueError("The following line has a number of elements not equal to the number of elements in the first line: \n {}".format(row))

                tmp_matrix.append([])
                for value in row:
                    try:
                        tmp_matrix[allyIndex].append(encoding[value] if value in encoding else float(value))
                    except ValueError:
                        logger.error("Unknown value {}. Use numbers or use default encoding: {}.", path, value)
                        raise ValueError("Unknown value {}. Use numbers or use default encoding: {}.".format(path, value))
            
            game_state.matrix = np.array(tmp_matrix)
            return game_state
    except:
        if hard_crash:
            raise SystemError("Missing file: {}".format(filename))
        else:
            logger.error("Warning: Missing file: {}", filename)
            return game_state


def initialize_gamestates():
    print("Initialising gamestate dictionaries (This might take a few minutes):")

    dictionaries_loaded_from_files = False

    if store.settings.read_gamestates:
        dictionaries_loaded_from_files = True

        for name in global_gamestate_dictionary_names:
            path = utilities.get_path(name + ".json")
            key_list = read_write.read_dictionary(path)

            if (key_list is not None and len(key_list) > 0):
                dictionaries[name] = {key: game_state.get_gamestate_from_key(key) for key in key_list}
            else:
                dictionaries_loaded_from_files = False
                break