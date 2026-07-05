import drafter.common.utilities as utilities  # local source
import drafter.common.game_state as game_state
from drafter.common.game_state import GameState
from drafter.common.team_permutation import TeamPermutation
from drafter.common.draft_stage import DraftStage
import drafter.common.draft_stage as draft_stage
import drafter.data.read_write as read_write

global_gamestate_dictionary_names = [
    utilities.get_gamestate_dictionary_name(8, DraftStage.none),
    utilities.get_gamestate_dictionary_name(8, DraftStage.select_defender),
    utilities.get_gamestate_dictionary_name(8, DraftStage.select_attackers),
    utilities.get_gamestate_dictionary_name(8, DraftStage.discard_attacker),
    utilities.get_gamestate_dictionary_name(6, DraftStage.none),
    utilities.get_gamestate_dictionary_name(6, DraftStage.select_defender),
    utilities.get_gamestate_dictionary_name(6, DraftStage.select_attackers),
    utilities.get_gamestate_dictionary_name(6, DraftStage.discard_attacker),
    utilities.get_gamestate_dictionary_name(4, DraftStage.none),
    utilities.get_gamestate_dictionary_name(4, DraftStage.select_defender),
    utilities.get_gamestate_dictionary_name(4, DraftStage.select_attackers)]


def make_gamestate_dictionaries():
    # A fresh, empty gamestate store for one SolverContext (GitHub issue #13);
    # replaces the module-level `dictionaries` global.
    return {name: {} for name in global_gamestate_dictionary_names}


def initialise_dictionaries(ctx, read, write):
    dictionaries_loaded_from_files = False
    if read:
        dictionaries_loaded_from_files = read_dictionaries(ctx)

    if not dictionaries_loaded_from_files:
        initial_game_state = get_initial_game_state(ctx)
        seed_dictionary = {'seed': initial_game_state}
        perform_gamestate_tree_extension(ctx, seed_dictionary)

        if write:
            write_dictionaries(ctx)


def read_dictionaries(ctx):
    for name in global_gamestate_dictionary_names:
        path = ctx.paths.cache_file(name + ".json")
        key_list = read_write.read_dictionary(path)

        if (key_list is not None and len(key_list) > 0):
            # JSON turns the (friendly, enemy) tuple keys into 2-element lists;
            # tuple them back so they are hashable dict keys again.
            ctx.gamestate_dictionaries[name] = {
                tuple(key): game_state.get_gamestate_from_key(key) for key in key_list}
        else:
            return False

    return True


def write_dictionaries(ctx):
    for name in global_gamestate_dictionary_names:
        path = ctx.paths.cache_file(name + ".json")
        # The (friendly, enemy) integer-code tuples serialise to JSON as lists.
        key_list = [key for key in ctx.gamestate_dictionaries[name]]
        read_write.write_dictionary(path, key_list)


def get_initial_game_state(ctx):
    friends = list(range(len(ctx.friendly.names)))
    enemies = list(range(len(ctx.enemy.names)))
    initial_game_state = GameState(DraftStage.none, TeamPermutation(friends), TeamPermutation(enemies))

    return initial_game_state


def perform_gamestate_tree_extension(ctx, parent_dictionary, new_gamestates_dictionaries=None):
    current_arbitrary_gamestate = utilities.get_arbitrary_dictionary_entry(parent_dictionary)
    current_global_gamestate_dictionary_name = current_arbitrary_gamestate.get_gamestate_dictionary_name()
    print_extend_dictionaries(current_global_gamestate_dictionary_name, new_gamestates_dictionaries)

    produced_gamestate_dictionaries = extend_gamestate_tree_from_seed_dictionary(ctx, parent_dictionary, new_gamestates_dictionaries)

    if produced_gamestate_dictionaries is not None:
        produced_gamestate_dictionaries = [new_gamestates_dictionary for new_gamestates_dictionary
            in produced_gamestate_dictionaries if len(new_gamestates_dictionary) > 0]

    return produced_gamestate_dictionaries


def extend_gamestate_tree_from_seed_dictionary(ctx, parent_dictionary, new_gamestate_dictionaries=None):
    if len(parent_dictionary) == 0:
        return new_gamestate_dictionaries

    current_arbitrary_gamestate = utilities.get_arbitrary_dictionary_entry(parent_dictionary)

    current_draft_stage = current_arbitrary_gamestate.draft_stage
    current_n = current_arbitrary_gamestate.get_n()

    current_global_gamestate_dictionary_name = utilities.get_gamestate_dictionary_name(current_n, current_draft_stage)
    current_global_dictionary = ctx.gamestate_dictionaries[current_global_gamestate_dictionary_name]

    if (current_global_dictionary is None):
        return new_gamestate_dictionaries

    parent_gamestates = [parent_dictionary[key] for key in parent_dictionary]
    added_subdictionary = add_gamestates_to_dictionary(current_global_dictionary, parent_gamestates)

    print("    - Done: {} gamestates added".format(len(added_subdictionary)))

    if len(added_subdictionary) == 0:
        return new_gamestate_dictionaries

    if (new_gamestate_dictionaries is not None):
        new_gamestate_dictionaries.append(added_subdictionary)

    next_draft_stage = draft_stage.get_next_draft_stage(current_draft_stage)
    next_n = current_n

    if (next_n == 4 and next_draft_stage == DraftStage.discard_attacker):
        return new_gamestate_dictionaries

    next_global_gamestate_dictionary_name = utilities.get_gamestate_dictionary_name(next_n, next_draft_stage)

    print_extend_dictionaries(next_global_gamestate_dictionary_name, new_gamestate_dictionaries)

    generated_gamestate_dictionary = {}
    for parent_key in parent_dictionary:
        parent_gamestate = parent_dictionary[parent_key]
        child_gamestates = game_state.get_next_gamestates(ctx, parent_gamestate)
        add_gamestates_to_dictionary(generated_gamestate_dictionary, child_gamestates)

    extend_gamestate_tree_from_seed_dictionary(ctx, generated_gamestate_dictionary, new_gamestate_dictionaries)

    return new_gamestate_dictionaries


def print_extend_dictionaries(dictionary_name, new_gamestate_dictionaries):
    if new_gamestate_dictionaries is None:
        description = "Initialising"
    else:
        description = "Extending"

    print(" - {} {}...".format(description, dictionary_name))


def add_gamestates_to_dictionary(dictionary, gamestates):
    added_subdictionary = {}

    for gamestate_var in gamestates:
        key = gamestate_var.get_key()

        if key not in dictionary:
            dictionary[key] = gamestate_var
            added_subdictionary[key] = gamestate_var

    return added_subdictionary


def get_previous_gamestate_dictionary(ctx, gamestate_dictionary):
    arbitrary_gamestate = utilities.get_arbitrary_dictionary_entry(gamestate_dictionary)
    n = arbitrary_gamestate.get_n()
    current_draft_stage = arbitrary_gamestate.draft_stage

    if n == 8 and current_draft_stage == DraftStage.none:
        return None

    previous_draft_stage = draft_stage.get_previous_draft_stage(current_draft_stage)

    if (previous_draft_stage == DraftStage.discard_attacker):
        n += 2

        if n > 10:
            return None

    next_gamestate_dictionary_name = utilities.get_gamestate_dictionary_name(n, previous_draft_stage)
    next_gamestate_dictionary = ctx.gamestate_dictionaries[next_gamestate_dictionary_name]

    return next_gamestate_dictionary