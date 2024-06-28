import drafter.common.utilities as utilities  # local source
import drafter.common.team_permutation as team_permutation
import drafter.common.draft_stage as draft_stage

class GameState:
    def __init__(self, draft_stage, friendly_team_permutation, enemy_team_permutation):
        self.draft_stage = draft_stage
        self.friendly_team_permutation = friendly_team_permutation
        self.enemy_team_permutation = enemy_team_permutation

    def get_key(self, leading_whitespace = ""):
        return "{}Friends: {}\n{}Enemies: {}".format(leading_whitespace, self.friendly_team_permutation.get_key(), 
            leading_whitespace, self.enemy_team_permutation.get_key())

    def get_n(self):
        friendly_n = self.friendly_team_permutation.get_n()
        enemy_n = self.enemy_team_permutation.get_n()

        if friendly_n != enemy_n:
            raise ValueError("Inconsistent number of players.")

        return friendly_n

    def get_gamestate_dictionary_name(self):
        n = self.get_n()
        gamestate_dictionary_name = utilities.get_gamestate_dictionary_name(n, self.draft_stage)
        return gamestate_dictionary_name

    # Returns the name of the draft iteration that follows this gamestate.
    def get_strategy_dictionary_name(self):
        n = self.get_n()
        draft_stage_to_solve = draft_stage.get_next_draft_stage(self.draft_stage)
        strategy_dictionary_name = utilities.get_strategy_dictionary_name(n, draft_stage_to_solve)
        return strategy_dictionary_name


def get_next_gamestates(game_permutation):
    next_game_permutations_matrix = get_next_gamestate_matrix(game_permutation)
    next_game_permutations = []

    for row in next_game_permutations_matrix:
        for game_permutation in row:
            next_game_permutations.append(game_permutation)

    return next_game_permutations


def get_next_gamestate_matrix(gamestate):
    next_draft_stage = draft_stage.get_next_draft_stage(gamestate.draft_stage)
    next_friendly_team_permutations = team_permutation.get_team_permutations_for_stage(
        next_draft_stage, gamestate.friendly_team_permutation, gamestate.enemy_team_permutation)

    next_enemy_team_permutations = team_permutation.get_team_permutations_for_stage(
        next_draft_stage, gamestate.enemy_team_permutation, gamestate.friendly_team_permutation)

    team_permutations_product = utilities.get_cartesian_product(
        next_friendly_team_permutations, next_enemy_team_permutations)

    next_game_permutations_matrix = \
        [[GameState(next_draft_stage, team_permutations_product[(i, j)][0], team_permutations_product[(i, j)][1])
            for j in range(0, len(next_enemy_team_permutations))]
            for i in range(0, len(next_friendly_team_permutations))]

    return next_game_permutations_matrix


def get_gamestate_from_key(key):
    friendly_team_representation, enemy_team_representation = key.split('\n', 1)
    friendly_team_permutation = team_permutation.get_team_permutation_from_key(friendly_team_representation)
    enemy_team_permutation = team_permutation.get_team_permutation_from_key(enemy_team_representation)
    draft_stage = friendly_team_permutation.get_draft_stage()

    return GameState(draft_stage, friendly_team_permutation, enemy_team_permutation)