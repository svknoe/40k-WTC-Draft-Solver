import time  # standard libraries
import csv

import drafter.common.utilities as utilities  # local source
import drafter.common.team_permutation as team_permutation
import drafter.data.settings as settings
import drafter.data.match_info as match_info
import drafter.data.read_write as read_write
import drafter.solver.strategy_dictionaries as strategy_dictionaries
import drafter.solver.game_state_dictionaries as game_state_dictionaries


def initialise():
    initialise_input_dictionary(match_info.pairing_dictionary_best, "pairing_matrix_best.csv")
    initialise_input_dictionary(match_info.pairing_dictionary_worst, "pairing_matrix_worst.csv")
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


class InputError(ValueError):
    """A problem with a match folder's input CSVs, with a message that names
    the actual file, location and cause (GitHub issue #11) -- as opposed to
    the old behaviour of reporting every failure as 'Missing file'."""


# Legacy rating tokens: expected 20-0 score margins. Kept so old-style matrices
# and captains' shorthand keep working. Note that a bare '0' is a token (an
# even matchup, i.e. an expected 10-10 score), not the 0-20 score 0.
legacy_token_encoding = {'--': -8, '-': -4, '0': 0, '+': 4, '++': 8}


def parse_rating(value):
    """Normalise one CSV rating cell to the engine's internal margin scale.

    Accepts the legacy --/-/0/+/++ tokens (margins -8..+8) or a number on the
    community 0-20 scale (expected score out of 20), converted via
    margin = 2 * (score - 10). Raises ValueError for anything else.

    Stripping first matters: float() ignores whitespace, so without it ' 0'
    (a space after the comma in the CSV) would skip the token lookup and
    silently parse as the score 0 (margin -20) instead of an even matchup.
    """
    value = value.strip()

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
                raise InputError("pairing_matrix_worst.csv is missing the {} vs {} entry "
                    "present in pairing_matrix_best.csv.".format(friend, enemy))

            if best_value < worst_value:
                raise InputError("Best-map value ({}) is below worst-map value ({}) for {} vs {}. "
                    "Both matrices are rated from the friendly side's perspective; "
                    "check for swapped files or rows.".format(best_value, worst_value, friend, enemy))


# TODO: don't mutate passed parameters! empty_input_dictionary should be a stored value
def initialise_input_dictionary(empty_input_dictionary: dict[str, dict[str, float]], filename):
    path = utilities.get_path(filename)

    if not path.is_file():
        raise InputError("Missing input file: {}. A match folder needs both "
            "pairing_matrix_best.csv and pairing_matrix_worst.csv.".format(path))

    try:
        with path.open(encoding="UTF-8") as file:
            # Keep the real line number next to each non-blank row so errors
            # can point at the exact line even when blank lines are skipped.
            csv_reader = csv.reader(file)
            numbered_rows = [(csv_reader.line_num, row) for row in csv_reader if len(row) > 0]
    except UnicodeDecodeError as error:
        raise InputError("{} is not UTF-8 encoded ({}). Re-save the file as UTF-8.".format(path, error))

    if len(numbered_rows) < 2:
        raise InputError("{}: expected two header rows (friendly names, then enemy names) "
            "followed by one rating row per friendly player.".format(path))

    (_, allies), (_, enemies) = numbered_rows[0], numbered_rows[1]
    allies = [ally.strip() for ally in allies]
    enemies = [enemy.strip() for enemy in enemies]
    data_rows = numbered_rows[2:]

    for team_name, team in [("friendly", allies), ("enemy", enemies)]:
        duplicates = sorted({player for player in team if team.count(player) > 1})
        if duplicates:
            raise InputError("{}: duplicate {} player name(s): {}. "
                "Names within a team must be unique.".format(path, team_name, ", ".join(duplicates)))

    if settings.require_unique_names:
        overlap = sorted(set(allies) & set(enemies))
        if overlap:
            raise InputError("{}: name(s) present on both teams: {}. Friendly and enemy "
                "names must not overlap (settings.require_unique_names).".format(path, ", ".join(overlap)))

    if len(enemies) != len(allies):
        raise InputError("{}: {} friendly names (line 1) but {} enemy names (line 2) "
            "-- the matrix must be square.".format(path, len(allies), len(enemies)))

    if len(data_rows) != len(allies):
        raise InputError("{}: {} rating rows for {} friendly players "
            "-- the matrix must be square.".format(path, len(data_rows), len(allies)))

    if len(allies) not in (4, 6, 8):
        raise InputError("{}: {} players per team; the draft needs 4, 6 or 8.".format(path, len(allies)))

    for ally, (line_number, row) in zip(allies, data_rows):
        if len(row) != len(enemies):
            raise InputError("{}, line {} ({}): {} ratings for {} enemies "
                "-- the matrix must be square.".format(path, line_number, ally, len(row), len(enemies)))

        for column_index, (enemy, value) in enumerate(zip(enemies, row)):
            try:
                rating = parse_rating(value)
            except ValueError:
                raise InputError("{}, line {}, column {} ({} vs {}): unknown rating {!r}. "
                    "Use a 0-20 score or one of the legacy tokens {}.".format(
                        path, line_number, column_index + 1, ally, enemy,
                        value, "/".join(legacy_token_encoding)))

            if ally not in empty_input_dictionary:
                empty_input_dictionary[ally] = {}
            empty_input_dictionary[ally][enemy] = rating
