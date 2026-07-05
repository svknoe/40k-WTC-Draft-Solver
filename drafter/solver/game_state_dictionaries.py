import numpy as np  # 3rd party packages

import drafter.common.game_state as game_state  # local source
from drafter.common.game_state import GameState
from drafter.common.team_permutation import TeamPermutation
from drafter.common.draft_stage import DraftStage
import drafter.common.draft_stage as draft_stage
import drafter.common.packing as packing


def get_initial_game_state(ctx):
    friends = list(range(len(ctx.friendly.names)))
    enemies = list(range(len(ctx.enemy.names)))
    return GameState(DraftStage.none, TeamPermutation(friends), TeamPermutation(enemies))


def stage_of_key(gamestate_key):
    # (n, draft_stage) of a gamestate, derived from its packed friendly team code.
    friendly_code = packing.decode_gamestate(int(gamestate_key))[0]
    return (packing.team_permutation_n(friendly_code), packing.draft_stage_of_code(friendly_code))


def enumerate_gamestates(ctx):
    """Breadth-first from the initial gamestate, returning
    {(n, draft_stage): sorted numpy int64 array of gamestate keys} for the
    select_defender/select_attackers/none stages that the backward induction
    solves (GitHub issue #13, B3). Only integer keys are kept -- GameState objects
    are decoded on demand -- so the whole tree costs ~12 MB instead of ~1 GB.
    """
    key_arrays = {}
    # Each BFS level is a single (n, stage); np.unique gives a sorted, deduped
    # int64 array (deduping via numpy rather than a Python set keeps the transient
    # peak low, which is the point of B3).
    current_level = np.array([get_initial_game_state(ctx).get_key()], dtype=np.int64)

    while len(current_level) > 0:
        n, stage = stage_of_key(int(current_level[0]))

        # The discard levels are pass-through only (their value is computed at the
        # parent select_attackers gamestate); we don't solve them, so don't store.
        if stage != DraftStage.discard_attacker:
            key_arrays[(n, stage)] = current_level

        # The 4-player discard is the closed-form endgame; stop before generating it.
        if n == 4 and draft_stage.get_next_draft_stage(stage) == DraftStage.discard_attacker:
            break

        child_keys = []
        for gamestate_key in current_level:
            gamestate = game_state.get_gamestate_from_key(int(gamestate_key))
            for child in game_state.get_next_gamestates(ctx, gamestate):
                child_keys.append(child.get_key())
        current_level = np.unique(np.array(child_keys, dtype=np.int64))

    return key_arrays
