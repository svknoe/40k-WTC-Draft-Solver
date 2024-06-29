import time  # standard libraries
import sys
from loguru import logger

import drafter.common.utilities as utilities  # local source
import drafter.common.team_permutation as team_permutation
import drafter.data.settings as settings
import drafter.data.match_info as match_info
import drafter.solver.strategy_dictionaries as strategy_dictionaries
import drafter.solver.game_state_dictionaries as game_state_dictionaries


def initialise():
    initialise_input_dictionary(match_info.pairing_dictionary, "pairing_matrix.txt", True)
    initialise_input_dictionary(match_info.map_importance_dictionary, "map_importance_matrix.txt", False)

    if (settings.restrict_attackers):
        team_permutation.enable_restricted_attackers(settings.restricted_attackers_count)

    t0 = time.time()
    print("Initialising gamestate dictionaries (This might take a few minutes):")
    game_state_dictionaries.initialise_dictionaries(settings.read_gamestates, settings.write_gamestates)
    print("time: {}s".format(round(time.time() - t0, 2)))

    t0 = time.time()
    if settings.read_strategies:
        print("Initialising strategy dictionaries (This might take a few minutes):")
    else:
        if settings.restrict_attackers and settings.restricted_attackers_count < 4:
            print("Initialising strategy dictionaries (This might take a few minutes):")
        elif settings.restrict_attackers and settings.restricted_attackers_count < 5:
            print("Initialising strategy dictionaries (This might take an hour.):")
        else:
            long_runtime_warning = "Initialising strategy dictionaries (This might take many hours."
            + " Enable restrict_attackers with restricted_attackers_count < 5 to reduce runtime.):"
            print(long_runtime_warning)
    strategy_dictionaries.initialise_dictionaries(settings.read_strategies, settings.write_strategies)
    print("time: {}s".format(round(time.time() - t0, 2)))


def initialise_input_dictionary(empty_input_dictionary, filename, hard_crash):
    encoding={'--': -8, '-': -4, '0': 0, '+': 4, '++': 8}
    path = utilities.get_path(filename)

    # Read file
    # ? It might not be needed to do that if we go for object oriented.
    try:
        with path.open(encoding="UTF-8") as f:
            lines = [line for line in f.read().splitlines() if line != ""]
    except:
        if hard_crash:
            raise SystemError("Missing file: {}".format(path))
        else:
            logger.error("Warning: Missing file: {path}")
            return

    # Init formatted line by setting the header
    formattedLines = []
    formattedLines.append(lines[0].split('|'))

    formattedMatchups = []

    for index, line in enumerate(lines[1:], 1):
        formattedLine: list[str] = line.split('|')

        if (len(formattedLine) != len(formattedLines[0])):
            logger.error("The following line has a number of elements not equal to the number of elements in the first line: \n{line}")
            sys.exit()

        formattedLines.append(formattedLine)

        if index > 1:
            formattedMatchup = []
            for element in formattedLine:
                try:
                    formattedMatchup.append(float(element))
                except ValueError:
                    if element in encoding:
                        formattedMatchup.append(encoding[element])
                    else:
                        error_message = ("File {} contains unknown element {}. Use number values, specify encoding or use "
                            + "default encoding: {}.").format(path, element, encoding)
                        raise ValueError(error_message)
            formattedMatchups.append(formattedMatchup)

    friends = formattedLines[0]
    enemies = formattedLines[1]

    if settings.require_unique_names:
        for friend in friends:
            if friend in enemies:
                raise ValueError("Player {} present on both teams. All player names must be unique.".format(friend))

    friendCounter = 0
    for friend in friends:
        row = {}
        enemyCounter = 0
        for enemy in enemies:
            row[enemy] = formattedMatchups[friendCounter][enemyCounter]
            enemyCounter += 1
        empty_input_dictionary[friend] = row
        friendCounter += 1