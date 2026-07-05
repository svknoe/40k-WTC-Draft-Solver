import time  # standard libraries
import csv

import drafter.common.team_permutation as team_permutation  # local source
from drafter.common.pairing import PairingTables
import drafter.data.read_write as read_write
import drafter.data.paths as paths
import drafter.solver.context as context
import drafter.solver.games as games
import drafter.solver.strategy_dictionaries as strategy_dictionaries
import drafter.solver.game_state_dictionaries as game_state_dictionaries


def initialise(enemy_team_name, config):
    """Load a match's input matrices, build the SolverContext, and solve the
    whole draft tree into it. Returns the populated SolverContext (GitHub issue
    #13, B2 solver-context refactor: no module-level globals)."""
    match_paths = paths.resolve_match(enemy_team_name)

    best = read_pairing_matrix(
        match_paths.input_file("pairing_matrix_best.csv"), config.require_unique_names)
    worst = read_pairing_matrix(
        match_paths.input_file("pairing_matrix_worst.csv"), config.require_unique_names)
    validate_best_not_below_worst(best, worst)

    # Assign player indices in name-sorted order (see context.NameIndex): enemy
    # names are the columns of any friendly row.
    friendly = context.NameIndex.from_names(best.keys())
    enemy = context.NameIndex.from_names(next(iter(best.values())).keys())
    pairing = PairingTables.from_dicts(best, worst, friendly, enemy, config.neutral_map_weight)

    restriction = None
    if config.restrict_attackers:
        restriction = team_permutation.build_restriction(pairing, config.restricted_attackers_count)

    ctx = context.SolverContext(
        config=config,
        enemy_team_name=enemy_team_name,
        friendly=friendly,
        enemy=enemy,
        pairing=pairing,
        restriction=restriction,
        paths=match_paths,
        gamestate_dictionaries=game_state_dictionaries.make_gamestate_dictionaries(),
        strategy_dictionaries=strategy_dictionaries.make_strategy_dictionaries(),
        game_solution_caches=games.make_game_solution_caches())

    friendly_names = list(friendly.names)
    enemy_names = list(enemy.names)

    # Cached JSONs carry solved game values keyed by positional integer codes, so
    # a cache written under an older value model or a different player set/order
    # would load fine but be silently wrong. Only read caches whose marker matches
    # the current engine and the current name ordering; the marker is written
    # after a successful solve+write below.
    caches_are_current = read_write.cache_format_is_current(
        match_paths.cache_file(read_write.CACHE_FORMAT_FILENAME), friendly_names, enemy_names)
    if (config.read_gamestates or config.read_strategies) and not caches_are_current:
        print("Ignoring cached JSONs in this match folder (missing or outdated {}): "
            "they were computed under an older value model. Solving fresh."
            .format(read_write.CACHE_FORMAT_FILENAME))

    t0 = time.time()
    print("Initialising gamestate dictionaries (This might take a few minutes):")
    game_state_dictionaries.initialise_dictionaries(
        ctx, config.read_gamestates and caches_are_current, config.write_gamestates)
    print("time: {}s".format(round(time.time() - t0, 2)))

    t0 = time.time()
    if config.read_strategies:
        print("Initialising strategy dictionaries (This might take a few minutes):")
    else:
        if config.restrict_attackers and config.restricted_attackers_count < 4:
            print("Initialising strategy dictionaries (This might take a few minutes):")
        elif config.restrict_attackers and config.restricted_attackers_count < 5:
            print("Initialising strategy dictionaries (This might take an hour.):")
        else:
            long_runtime_warning = ("Initialising strategy dictionaries (This might take many hours."
                + " Enable restrict_attackers with restricted_attackers_count < 5 to reduce runtime.):")
            print(long_runtime_warning)
    strategy_dictionaries.initialise_dictionaries(
        ctx, config.read_strategies and caches_are_current, config.write_strategies)
    print("time: {}s".format(round(time.time() - t0, 2)))

    if config.write_gamestates and config.write_strategies:
        read_write.write_cache_format_marker(
            match_paths.cache_file(read_write.CACHE_FORMAT_FILENAME), friendly_names, enemy_names)

    return ctx


class InputError(ValueError):
    """A problem with a match folder's input CSVs, with a message that names
    the actual file, location and cause (GitHub issue #11) -- as opposed to
    the old behaviour of reporting every failure as 'Missing file'."""


# Legacy rating tokens: deviations from an even 10-10 game, so '+' = +4 is an
# expected 14-6 and '++' = +8 an 18-2 (PLAN.md rating-scale convention,
# corrected 2026-07-04). Kept so old-style matrices and captains' shorthand
# keep working. Note that a bare '0' is a token (an even matchup, i.e. an
# expected 10-10 score), not the 0-20 score 0.
legacy_token_encoding = {'--': -8, '-': -4, '0': 0, '+': 4, '++': 8}


def parse_rating(value):
    """Normalise one CSV rating cell to the engine's internal scale: the
    deviation from an even game, i.e. internal = score - 10, range -10..+10.

    Accepts the legacy --/-/0/+/++ tokens (already deviations, -8..+8) or a
    number on the community 0-20 scale (expected score out of 20). Raises
    ValueError for anything else.

    Stripping first matters: float() ignores whitespace, so without it ' 0'
    (a space after the comma in the CSV) would skip the token lookup and
    silently parse as the score 0 (deviation -10) instead of an even matchup.
    """
    value = value.strip()

    if value in legacy_token_encoding:
        return legacy_token_encoding[value]

    score = float(value)  # may raise ValueError, handled by callers

    if not 0 <= score <= 20:
        raise ValueError("Rating {} is outside the 0-20 score scale.".format(value))

    return score - 10


def validate_best_not_below_worst(best, worst):
    for friend in best:
        for enemy in best[friend]:
            best_value = best[friend][enemy]
            worst_value = worst.get(friend, {}).get(enemy)

            if worst_value is None:
                raise InputError("pairing_matrix_worst.csv is missing the {} vs {} entry "
                    "present in pairing_matrix_best.csv.".format(friend, enemy))

            if best_value < worst_value:
                raise InputError("Best-map value ({}) is below worst-map value ({}) for {} vs {}. "
                    "Both matrices are rated from the friendly side's perspective; "
                    "check for swapped files or rows.".format(best_value, worst_value, friend, enemy))


def read_pairing_matrix(path, require_unique_names):
    """Read one pairing matrix CSV into a {friendly: {enemy: value}} dict.
    `path` is the resolved file, `require_unique_names` the config flag; both
    are passed explicitly rather than read from module globals (issue #13)."""
    if not path.is_file():
        raise InputError("Missing input file: {}. A match folder needs both "
            "pairing_matrix_best.csv and pairing_matrix_worst.csv.".format(path))

    try:
        # utf-8-sig: Excel's "CSV UTF-8" prefixes a BOM, which plain utf-8
        # would silently glue onto the first player name as U+FEFF.
        with path.open(encoding="utf-8-sig") as file:
            # Keep the real line number next to each non-blank row so errors
            # can point at the exact line even when blank lines are skipped.
            csv_reader = csv.reader(file)
            numbered_rows = [(csv_reader.line_num, row) for row in csv_reader if len(row) > 0]
    except UnicodeDecodeError as error:
        raise InputError("{} is not UTF-8 encoded ({}). Re-save the file as UTF-8.".format(path, error)) from None

    if len(numbered_rows) < 2:
        raise InputError("{}: expected two header rows (friendly names, then enemy names) "
            "followed by one rating row per friendly player.".format(path))

    (_, allies), (_, enemies) = numbered_rows[0], numbered_rows[1]
    allies = [ally.strip() for ally in allies]
    enemies = [enemy.strip() for enemy in enemies]
    data_rows = numbered_rows[2:]

    for team_name, team in [("friendly", allies), ("enemy", enemies)]:
        if any(player == "" for player in team):
            raise InputError("{}: empty {} player name in the header "
                "(check for a trailing comma or a missing name).".format(path, team_name))

        duplicates = sorted({player for player in team if team.count(player) > 1})
        if duplicates:
            raise InputError("{}: duplicate {} player name(s): {}. "
                "Names within a team must be unique.".format(path, team_name, ", ".join(duplicates)))

    if require_unique_names:
        overlap = sorted(set(allies) & set(enemies))
        if overlap:
            raise InputError("{}: name(s) present on both teams: {}. Friendly and enemy "
                "names must not overlap (require_unique_names).".format(path, ", ".join(overlap)))

    if len(enemies) != len(allies):
        raise InputError("{}: {} friendly names (line 1) but {} enemy names (line 2) "
            "-- the matrix must be square.".format(path, len(allies), len(enemies)))

    if len(data_rows) != len(allies):
        raise InputError("{}: {} rating rows for {} friendly players "
            "-- the matrix must be square.".format(path, len(data_rows), len(allies)))

    if len(allies) not in (4, 6, 8):
        raise InputError("{}: {} players per team; the draft needs 4, 6 or 8.".format(path, len(allies)))

    input_dictionary = {}

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
                        value, "/".join(legacy_token_encoding))) from None

            if ally not in input_dictionary:
                input_dictionary[ally] = {}
            input_dictionary[ally][enemy] = rating

    return input_dictionary
