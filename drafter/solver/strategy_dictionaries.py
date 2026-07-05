"""Value-only backward induction (GitHub issue #13, B3).

The tree only propagates game *values*, stored per (n, draft_stage) as parallel
sorted numpy arrays (keys + values) with binary-search lookup -- ~8 MB total
instead of the ~810 MB of full strategy vectors the old strategy dictionaries
held. The interactive draft recomputes the labelled mixed strategy on demand for
the ~20 gamestates it actually visits (games.build_game + get_game_strategy), and
the same recursion transparently solves any off-tree (non-k-restricted) subtree
the user navigates into -- no separate tree-extension machinery.
"""
import numpy as np  # 3rd party packages

import drafter.common.utilities as utilities  # local source
import drafter.common.game_state as game_state
import drafter.common.packing as packing
from drafter.common.draft_stage import DraftStage
import drafter.solver.games as games


class StageValues:
    """Solved game values for one (n, draft_stage), as a sorted key array and a
    parallel value array; O(log n) binary-search lookup."""
    __slots__ = ("keys", "values")

    def __init__(self, keys, values):
        self.keys = keys
        self.values = values

    def contains(self, gamestate_key):
        index = np.searchsorted(self.keys, gamestate_key)
        return index < len(self.keys) and self.keys[index] == gamestate_key

    def value(self, gamestate_key):
        return float(self.values[np.searchsorted(self.keys, gamestate_key)])


# Deepest first: a gamestate's game reads the values of its children, so children
# must be solved before their parents.
def solve_order():
    order = []
    for n in (4, 6, 8):
        for stage in (DraftStage.select_attackers, DraftStage.select_defender, DraftStage.none):
            order.append((n, stage))
    return order


def child_stage(n, stage):
    # The stage whose gamestate values the (n, stage) game is built from.
    if stage == DraftStage.none:
        return (n, DraftStage.select_defender)
    if stage == DraftStage.select_defender:
        return (n, DraftStage.select_attackers)
    if stage == DraftStage.select_attackers:
        return (n - 2, DraftStage.none)  # the discard game's 'none' subgames (n>4)
    raise ValueError("No child stage for {}.".format(stage))


def initialise_values(ctx):
    """Solve every enumerated gamestate's value into ctx.value_arrays, deepest
    stage first."""
    for (n, stage) in solve_order():
        keys = ctx.gamestate_key_arrays.get((n, stage))
        if keys is None or len(keys) == 0:
            continue

        child_store = ctx.value_arrays.get(child_stage(n, stage))
        get_child_value = child_store.value if child_store is not None else _missing_child

        values = np.empty(len(keys), dtype=float)
        for index in range(len(keys)):
            gamestate = game_state.get_gamestate_from_key(int(keys[index]))
            game_array, _, _ = games.build_game(ctx, gamestate, get_child_value)
            values[index] = utilities.get_game_value(game_array)

        ctx.value_arrays[(n, stage)] = StageValues(keys, values)


def _missing_child(gamestate_key):
    raise KeyError("No child value store (should only happen for the 4-player endgame).")


# --- draft-time lookups: recompute strategies / values on demand ---

def known_value(ctx, gamestate_key):
    friendly_code = packing.decode_gamestate(gamestate_key)[0]
    n = packing.team_permutation_n(friendly_code)
    stage = packing.draft_stage_of_code(friendly_code)

    store = ctx.value_arrays.get((n, stage))
    if store is not None and store.contains(gamestate_key):
        return store.value(gamestate_key)

    return ctx.extension_values.get(gamestate_key)


def game_value(ctx, gamestate):
    """The value of `gamestate`: precomputed if it's on the solved tree, else
    solved on demand (recursively) and memoised -- this is what lets the draft
    follow off-tree, non-k-restricted moves."""
    gamestate_key = gamestate.get_key()

    value = known_value(ctx, gamestate_key)
    if value is not None:
        return value

    game_array, _, _ = games.build_game(ctx, gamestate, _child_value_getter(ctx))
    value = utilities.get_game_value(game_array)
    ctx.extension_values[gamestate_key] = value
    return value


def game_strategy(ctx, gamestate):
    """The labelled mixed strategy for the game decided at `gamestate`, recomputed
    from its children's values (one solve; the draft visits ~20 gamestates)."""
    game_array, friendly_options, enemy_options = games.build_game(
        ctx, gamestate, _child_value_getter(ctx))
    return utilities.get_game_strategy(ctx.draft_strategy_cache, game_array, friendly_options, enemy_options)


def _child_value_getter(ctx):
    return lambda child_key: game_value(ctx, game_state.get_gamestate_from_key(child_key))
