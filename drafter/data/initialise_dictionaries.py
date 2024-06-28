import time  # standard libraries
import sys

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
    print()
    print("Initialising gamestate dictionaries (This might take a few minutes):")
    game_state_dictionaries.initialise_dictionaries(settings.read_gamestates, settings.write_gamestates)
    print("time: {}s".format(round(time.time() - t0, 2)))

    t0 = time.time()
    print()
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


def initialise_input_dictionary(empty_input_dictionary, filename, hard_crash, encoding={'--': -8, '-': -4, '0': 0, '+': 4, '++': 8}):
    path = utilities.get_path(filename)

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
                    error_message = ("File {} contains unknown element {}. Use number values, specify encoding or use "
                        + "default encoding: {}.").format(path, element, encoding)
                    raise ValueError(error_message)
        tmpMatchups.append(tmpMatchup)
    matchups = tmpMatchups

    friends = lines[0]
    enemies = lines[1]

    if settings.require_unique_names:
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