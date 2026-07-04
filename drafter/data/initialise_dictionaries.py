import time  # standard libraries
import sys
import csv
from loguru import logger

import drafter.common.utilities as utilities  # local source
import drafter.common.team_permutation as team_permutation
import drafter.data.settings as settings
import drafter.data.match_info as match_info
import drafter.data.read_write as read_write
import drafter.solver.strategy_dictionaries as strategy_dictionaries
import drafter.solver.game_state_dictionaries as game_state_dictionaries


def initialise():
    initialise_input_dictionary(match_info.pairing_dictionary_best, "pairing_matrix_best.csv", True)
    initialise_input_dictionary(match_info.pairing_dictionary_worst, "pairing_matrix_worst.csv", True)
    validate_best_not_below_worst()

    if (settings.restrict_attackers):
        team_permutation.enable_restricted_attackers(settings.restricted_attackers_count)

    # Cached JSONs carry solved game values, so caches written under an older
    # value model would load fine but be silently wrong. Only read them if the
    # match folder's format marker matches the current engine; the marker is
    # written after a successful solve+write below.
    caches_are_current = read_write.cache_format_is_current(utilities.get_path(read_write.CACHE_FORMAT_FILENAME))
    if (settings.read_gamestates or settings.read_strategies) and not caches_are_current:
        print("Ignoring cached JSONs in this match folder (missing or outdated {}): "
            "they were computed under an older value model. Solving fresh."
            .format(read_write.CACHE_FORMAT_FILENAME))

    t0 = time.time()
    print("Initialising gamestate dictionaries (This might take a few minutes):")
    game_state_dictionaries.initialise_dictionaries(
        settings.read_gamestates and caches_are_current, settings.write_gamestates)
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
            long_runtime_warning = ("Initialising strategy dictionaries (This might take many hours."
                + " Enable restrict_attackers with restricted_attackers_count < 5 to reduce runtime.):")
            print(long_runtime_warning)
    strategy_dictionaries.initialise_dictionaries(
        settings.read_strategies and caches_are_current, settings.write_strategies)
    print("time: {}s".format(round(time.time() - t0, 2)))

    if settings.write_gamestates and settings.write_strategies:
        read_write.write_cache_format_marker(utilities.get_path(read_write.CACHE_FORMAT_FILENAME))


# Legacy rating tokens: expected 20-0 score margins. Kept so old-style matrices
# and captains' shorthand keep working. Note that a bare '0' is a token (an
# even matchup, i.e. an expected 10-10 score), not the 0-20 score 0.
legacy_token_encoding = {'--': -8, '-': -4, '0': 0, '+': 4, '++': 8}


def parse_rating(value):
    """Normalise one CSV rating cell to the engine's internal margin scale.

    Accepts the legacy --/-/0/+/++ tokens (margins -8..+8) or a number on the
    community 0-20 scale (expected score out of 20), converted via
    margin = 2 * (score - 10). Raises ValueError for anything else.
    """
    if value in legacy_token_encoding:
        return legacy_token_encoding[value]

    score = float(value)  # may raise ValueError, handled by callers

    if not 0 <= score <= 20:
        raise ValueError("Rating {} is outside the 0-20 score scale.".format(value))

    return 2 * (score - 10)


def validate_best_not_below_worst():
    for friend in match_info.pairing_dictionary_best:
        for enemy in match_info.pairing_dictionary_best[friend]:
            best_value = match_info.pairing_dictionary_best[friend][enemy]
            worst_value = match_info.pairing_dictionary_worst.get(friend, {}).get(enemy)

            if worst_value is None:
                raise ValueError("pairing_matrix_worst.csv is missing the {} vs {} entry "
                    "present in pairing_matrix_best.csv.".format(friend, enemy))

            if best_value < worst_value:
                raise ValueError("Best-map value ({}) is below worst-map value ({}) for {} vs {}. "
                    "Both matrices are rated from the friendly side's perspective; "
                    "check for swapped files or rows.".format(best_value, worst_value, friend, enemy))


# TODO: don't mutate passed parameters! empty_input_dictionary should be a stored value
# ? This whole function seems to be used for formatting the csv file into a dictionary. Is it really needed?
def initialise_input_dictionary(empty_input_dictionary: dict[str, dict[str, list[int]]], filename, hard_crash):
    path = utilities.get_path(filename)

    # Read file
    # ? It might not be needed to do that if we go for object oriented.
    try:
        with utilities.get_path(filename).open(encoding="UTF-8") as file:
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

                # We convert the values to the internal margin scale
                for enemyIndex, value in enumerate(row):
                    ally = allies[allyIndex]
                    enemy = enemies[enemyIndex]

                    try:
                        if ally not in empty_input_dictionary:
                            empty_input_dictionary[ally] = {}
                        empty_input_dictionary[ally][enemy] = parse_rating(value)
                    except ValueError:
                        logger.error("Unknown value {} in {}. Use 0-20 scores or the legacy tokens: {}.",
                            value, path, list(legacy_token_encoding))
                        sys.exit()

            # ? Is this really needed? 2 people can have the same name.
            if settings.require_unique_names & any(ally in enemies for ally in allies):
                raise ValueError("Player present on both teams. All player names must be unique.")
    except:
        if hard_crash:
            raise SystemError("Missing file: {}".format(filename))
        else:
            logger.error("Warning: Missing file: {}", filename)
            return
