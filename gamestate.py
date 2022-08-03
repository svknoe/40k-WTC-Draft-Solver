import itertools # standard libraries

import utilities # local source
import teampermutation

class GameState:
    def __init__(self, draft_stage, friendly_team_permutation, enemy_team_permutation):
        self.draft_stage = draft_stage
        self.friendly_team_permutation = friendly_team_permutation
        self.enemy_team_permutation = enemy_team_permutation

    def get_key(self):
        return "Friends: {}\nEnemies: {}".format(self.friendly_team_permutation.get_key(), self.enemy_team_permutation.get_key())

    def get_n(self):
        friendly_n = len(self.friendly_team_permutation.remaining_players)
        if self.friendly_team_permutation.defender != None:
            friendly_n += 1
        if self.friendly_team_permutation.attacker_A != None:
            friendly_n += 1
        if self.friendly_team_permutation.attacker_B != None:
            friendly_n += 1
        
        enemy_n = len(self.enemy_team_permutation.remaining_players)
        if self.friendly_team_permutation.defender != None:
            enemy_n += 1
        if self.friendly_team_permutation.attacker_A != None:
            enemy_n += 1
        if self.friendly_team_permutation.attacker_B != None:
            enemy_n += 1

        if friendly_n != enemy_n:
            raise ValueError("Inconsistent number of players.")
        
        return friendly_n

    # Returns the name of the draft iteration that follows this gamestate.
    def get_iteration_name(self):
        n = self.get_n()
        draft_stage_to_solve = utilities.get_next_draft_stage(arbitrary_gamestate.draft_stage)
    
        if n == 4:
            num = "four"
        elif n == 6:
            num = "six"
        elif n == 8:
            num = "eight"
        else:
            raise Exception("{} is no a legal entry for n. Choose 4, 6 or 8.".format(n))

        iteration_name = num + "_player_" + draft_stage_to_solve.name + "_dictionary" 

def get_next_gamestates(game_permutation):
    next_game_permutations_matrix = get_next_gamestate_matrix(game_permutation)
    next_game_permutations = []

    for row in next_game_permutations_matrix:
        for game_permutation in row:
            next_game_permutations.append(game_permutation)

    return next_game_permutations

def get_next_gamestate_matrix(gamestate):
    next_draft_stage = utilities.get_next_draft_stage(gamestate.draft_stage)
    next_friendly_team_permutations = teampermutation.get_team_permutations_for_stage(next_draft_stage, gamestate.friendly_team_permutation, gamestate.enemy_team_permutation)
    next_enemy_team_permutations = teampermutation.get_team_permutations_for_stage(next_draft_stage, gamestate.enemy_team_permutation, gamestate.friendly_team_permutation)
    team_permutations_product = utilities.get_cartesian_product(next_friendly_team_permutations, next_enemy_team_permutations)

    next_game_permutations_matrix = [[GameState(next_draft_stage, team_permutations_product[(i,j)][0], team_permutations_product[(i,j)][1]) for j in range(0, len(next_enemy_team_permutations))] for i in range(0, len(next_friendly_team_permutations))]
    return next_game_permutations_matrix

