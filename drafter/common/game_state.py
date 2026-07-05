import drafter.common.utilities as utilities  # local source
import drafter.common.team_permutation as team_permutation
import drafter.common.draft_stage as draft_stage
import drafter.common.packing as packing

class GameState:
    def __init__(self, draft_stage, friendly_team_permutation, enemy_team_permutation):
        self.draft_stage = draft_stage
        self.friendly_team_permutation = friendly_team_permutation
        self.enemy_team_permutation = enemy_team_permutation

    def get_key(self):
        # A gamestate key is a single packed integer combining the friendly and
        # enemy team-permutation codes (issue #13; single-int form for numpy
        # storage, B3). Names are resolved only at the presentation layer.
        return packing.encode_gamestate(
            self.friendly_team_permutation.get_key(), self.enemy_team_permutation.get_key())

    def get_n(self):
        friendly_n = self.friendly_team_permutation.get_n()
        enemy_n = self.enemy_team_permutation.get_n()

        if friendly_n != enemy_n:
            raise ValueError("Inconsistent number of players.")

        return friendly_n


def get_next_gamestates(ctx, game_permutation):
    next_game_permutations_matrix = get_next_gamestate_matrix(ctx, game_permutation)
    next_game_permutations = []

    for row in next_game_permutations_matrix:
        for game_permutation in row:
            next_game_permutations.append(game_permutation)

    return next_game_permutations


def get_next_gamestate_matrix(ctx, gamestate):
    next_draft_stage = draft_stage.get_next_draft_stage(gamestate.draft_stage)
    next_friendly_team_permutations = team_permutation.get_team_permutations_for_stage(
        ctx, team_permutation.Side.FRIENDLY, next_draft_stage,
        gamestate.friendly_team_permutation, gamestate.enemy_team_permutation)

    next_enemy_team_permutations = team_permutation.get_team_permutations_for_stage(
        ctx, team_permutation.Side.ENEMY, next_draft_stage,
        gamestate.enemy_team_permutation, gamestate.friendly_team_permutation)

    team_permutations_product = utilities.get_cartesian_product(
        next_friendly_team_permutations, next_enemy_team_permutations)

    next_game_permutations_matrix = \
        [[GameState(next_draft_stage, team_permutations_product[(i, j)][0], team_permutations_product[(i, j)][1])
            for j in range(0, len(next_enemy_team_permutations))]
            for i in range(0, len(next_friendly_team_permutations))]

    return next_game_permutations_matrix


def get_gamestate_from_key(key):
    friendly_code, enemy_code = packing.decode_gamestate(key)
    friendly_team_permutation = team_permutation.get_team_permutation_from_key(friendly_code)
    enemy_team_permutation = team_permutation.get_team_permutation_from_key(enemy_code)
    draft_stage = friendly_team_permutation.get_draft_stage()

    return GameState(draft_stage, friendly_team_permutation, enemy_team_permutation)