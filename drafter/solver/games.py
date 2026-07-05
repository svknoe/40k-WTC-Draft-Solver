import numpy as np  # 3rd party packages

import drafter.common.game_state as game_state  # local source
from drafter.common.game_state import GameState
from drafter.common.team_permutation import TeamPermutation
from drafter.common.draft_stage import DraftStage
from drafter.common.pairing import Defender


# Build the payoff matrix (and its row/column option labels) for the game decided
# at `gamestate`, reading each child gamestate's value through get_child_value
# (GitHub issue #13, B3). Backward induction feeds it a direct array lookup; the
# draft loop feeds it a recursive on-demand value. Returns
# (game_array, friendly_options, enemy_options); the caller solves for the value
# (utilities.get_game_value) or the labelled strategy (utilities.get_game_strategy).
def build_game(ctx, gamestate, get_child_value):
    stage = gamestate.draft_stage
    if stage == DraftStage.none:
        return build_select_defender_game(ctx, gamestate, get_child_value)
    elif stage == DraftStage.select_defender:
        return build_select_attackers_game(ctx, gamestate, get_child_value)
    elif stage == DraftStage.select_attackers:
        return build_discard_game(ctx, gamestate, get_child_value)
    else:
        raise ValueError("Cannot build a game for draft stage {}.".format(stage))


def build_select_defender_game(ctx, none_gamestate, get_child_value):
    gamestate_matrix = game_state.get_next_gamestate_matrix(ctx, none_gamestate)
    friendly_options = [row[0].friendly_team_permutation.defender for row in gamestate_matrix]
    enemy_options = [gamestate.enemy_team_permutation.defender for gamestate in gamestate_matrix[0]]
    game_array = np.array([[get_child_value(gamestate.get_key()) for gamestate in row]
                           for row in gamestate_matrix])
    return game_array, friendly_options, enemy_options


def build_select_attackers_game(ctx, selected_defender_gamestate, get_child_value):
    gamestate_matrix = game_state.get_next_gamestate_matrix(ctx, selected_defender_gamestate)
    friendly_options = [[row[0].friendly_team_permutation.attacker_A,
        row[0].friendly_team_permutation.attacker_B] for row in gamestate_matrix]
    enemy_options = [[gamestate.enemy_team_permutation.attacker_A,
        gamestate.enemy_team_permutation.attacker_B] for gamestate in gamestate_matrix[0]]
    game_array = np.array([[get_child_value(gamestate.get_key()) for gamestate in row]
                           for row in gamestate_matrix])
    return game_array, friendly_options, enemy_options


def build_discard_game(ctx, selected_attackers_gamestate, get_child_value):
    friendly = selected_attackers_gamestate.friendly_team_permutation
    enemy = selected_attackers_gamestate.enemy_team_permutation
    f_defender, f_attacker_A, f_attacker_B = friendly.defender, friendly.attacker_A, friendly.attacker_B
    e_defender, e_attacker_A, e_attacker_B = enemy.defender, enemy.attacker_A, enemy.attacker_B

    fD_eA = ctx.pairing.value(f_defender, e_attacker_A, Defender.FRIENDLY)
    fD_eB = ctx.pairing.value(f_defender, e_attacker_B, Defender.FRIENDLY)
    fA_eD = ctx.pairing.value(f_attacker_A, e_defender, Defender.ENEMY)
    fB_eD = ctx.pairing.value(f_attacker_B, e_defender, Defender.ENEMY)

    if selected_attackers_gamestate.get_n() == 4:
        # 4-player endgame: refused-vs-refused and last-vs-last play each other,
        # so the two remaining players give a fixed extra term (no child game).
        f_not_selected = friendly.remaining_players[0]
        e_not_selected = enemy.remaining_players[0]

        fA_eA = ctx.pairing.value(f_attacker_A, e_attacker_A)
        fA_eB = ctx.pairing.value(f_attacker_A, e_attacker_B)
        fB_eA = ctx.pairing.value(f_attacker_B, e_attacker_A)
        fB_eB = ctx.pairing.value(f_attacker_B, e_attacker_B)
        fN_eN = ctx.pairing.value(f_not_selected, e_not_selected)

        AA = fD_eB + fB_eD + fA_eA + fN_eN
        AB = fD_eB + fA_eD + fB_eA + fN_eN
        BA = fD_eA + fB_eD + fA_eB + fN_eN
        BB = fD_eA + fA_eD + fB_eB + fN_eN
    else:
        # The child 'none' gamestate receives the REFUSED attackers back into the
        # pools (issue #32): in AB, e_B plays the friendly defender and f_A plays
        # the enemy defender, so the refused pair returning to the pools is
        # (f_B, e_A) -- mirrored in BA. The kept attackers' games are the
        # fD_*/f*_eD terms.
        def child_value(extra_friend, extra_enemy):
            child = GameState(DraftStage.none,
                TeamPermutation(friendly.remaining_players + [extra_friend]),
                TeamPermutation(enemy.remaining_players + [extra_enemy]))
            return get_child_value(child.get_key())

        AA = fD_eB + fB_eD + child_value(f_attacker_A, e_attacker_A)
        AB = fD_eB + fA_eD + child_value(f_attacker_B, e_attacker_A)
        BA = fD_eA + fB_eD + child_value(f_attacker_A, e_attacker_B)
        BB = fD_eA + fA_eD + child_value(f_attacker_B, e_attacker_B)

    game_array = np.array([[AA, AB], [BA, BB]])
    return game_array, [e_attacker_A, e_attacker_B], [f_attacker_A, f_attacker_B]
