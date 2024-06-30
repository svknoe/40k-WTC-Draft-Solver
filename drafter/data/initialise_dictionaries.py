import sys
import csv 
from loguru import logger

import drafter.common.utilities as utilities  # local source
import drafter.common.team_permutation as team_permutation
from drafter.store import store
import drafter.solver.strategy_dictionaries as strategy_dictionaries
import drafter.solver.game_state_dictionaries as game_state_dictionaries


def initialise():
    store.pairing = initialise_input_dictionary("pairing_matrix.csv", True)
    store.map_importance = initialise_input_dictionary("map_importance_matrix.csv", False)

    if (store.settings.restrict_attackers):
        team_permutation.enable_restricted_attackers()

    game_state_dictionaries.initialise_dictionaries()
    strategy_dictionaries.initialise_dictionaries()


# ? This whole function seems to be used for formatting the csv file into a dictionary. Is it really needed?
def initialise_input_dictionary(filename: str, hard_crash: bool):
    matchup_matrice = {}
    encoding = {'--': -8, '-': -4, '0': 0, '+': 4, '++': 8}
    path = utilities.get_path(filename)

    # Read file
    # ? It might not be needed to do that if we go for object oriented.
    try:
        with path.open(encoding="UTF-8") as file:
            table = csv.reader(file)

            # Extract the first two lines
            allies = next(table)
            enemies = next(table)

            for allyIndex, row in enumerate(table):
                # We skip empty rows
                if (len(row) == 0):
                    continue
                
                # We do an early return if the column numbers doesn't match the first row --> format error
                if (len(row) != len(allies)):
                    logger.error("The following line has a number of elements not equal to the number of elements in the first line: \n {}", row)
                    sys.exit()
                
                # We convert the values to float or to the encoding value
                for enemyIndex, value in enumerate(row):
                    ally = allies[allyIndex]
                    enemy = enemies[enemyIndex]

                    try:
                        if ally not in matchup_matrice:
                            matchup_matrice[ally] = {}
                        matchup_matrice[ally][enemy] = encoding[value] if value in encoding else float(value)
                    except ValueError:
                        logger.error("Unknown value {}. Use numbers or use default encoding: {}.", path, value, encoding)
                        sys.exit()

            # ? Is this really needed? 2 people can have the same name.
            if store.settings.require_unique_names & any(ally in enemies for ally in allies):
                raise ValueError("Player present on both teams. All player names must be unique.")    
            
            return matchup_matrice
    except:
        if hard_crash:
            raise SystemError("Missing file: {}".format(filename))
        else:
            logger.error("Warning: Missing file: {}", filename)
            return {}