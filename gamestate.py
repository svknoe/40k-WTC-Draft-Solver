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

def get_next_gamestates(game_permutation):
    next_game_permutations_matrix = get_next_gamestate_matrix(game_permutation)
    next_game_permutations = []

    for row in next_game_permutations_matrix:
        for game_permutation in row:
            next_game_permutations.append(game_permutation)

    return next_game_permutations

def get_next_gamestate_matrix(game_permutation):
    next_draft_stage = utilities.get_next_draft_stage(game_permutation.draft_stage)
    next_friendly_team_permutations = teampermutation.get_team_permutations_for_stage(next_draft_stage, game_permutation.friendly_team_permutation, game_permutation.enemy_team_permutation)
    next_enemy_team_permutations = teampermutation.get_team_permutations_for_stage(next_draft_stage, game_permutation.enemy_team_permutation, game_permutation.friendly_team_permutation)
    team_permutations_product = utilities.get_cartesian_product(next_friendly_team_permutations, next_enemy_team_permutations)

    next_game_permutations_matrix = [[GameState(next_draft_stage, team_permutations_product[(i,j)][0], team_permutations_product[(i,j)][1]) for j in range(0, len(next_enemy_team_permutations))] for i in range(0, len(next_friendly_team_permutations))]
    return next_game_permutations_matrix












def get_game_permutation(draft_stage, friends, enemies):
    friendly_team_permutation = teampermutation.get_team_permutation(draft_stage, friends)
    enemy_team_permutation = teampermutation.get_team_permutation(draft_stage, enemies)

    return GameState(friendly_team_permutation, enemy_team_permutation)

def get_game_permutations(matrix, draft_stage, n, restrict_attackers):
    friends = [friend for friend in matrix]
    enemies = [enemy for enemy in matrix[friends[0]]]
    
    friendly_team_permutations = teampermutation.get_team_permutations(draft_stage, n, friends)
    enemy_team_permutations = teampermutation.get_team_permutations(draft_stage, n, enemies)

    product = itertools.product(friendly_team_permutations, enemy_team_permutations)
    game_permutations = [GameState(element[0], element[1]) for element in product]

    print(draft_stage)
    if (False and restrict_attackers and draft_stage == utilities.DraftStage.defender_selected):
        restricted_game_permutations = game_permutations.copy()

        for game_permutation in game_permutations:
            friendly_team_permutation = game_permutation.friendly_team_permutation
            enemy_team_permutation = game_permutation.enemy_team_permutation

            friendly_non_defenders = friendly_team_permutation.remaining_players + [friendly_team_permutation.attacker_A, friendly_team_permutation.attacker_B]
            enemy_non_defenders = enemy_team_permutation.remaining_players + [enemy_team_permutation.attacker_A, enemy_team_permutation.attacker_B]
            
            friendly_non_defenders_vs_enemy_defender = {}
            for f_non_defender in friendly_non_defenders:
                friendly_non_defenders_vs_enemy_defender[f_non_defender] = matrix[f_non_defender][enemy_team_permutation.defender]

            friendly_non_defenders_vs_average_enemy_non_defender = []
            for f_non_defender in friendly_non_defenders:
                sum = 0

                for e_non_defender in enemy_non_defenders:
                    sum += matrix[f_non_defender][e_non_defender]

                friendly_non_defenders_vs_average_enemy_non_defender.append([f_non_defender, sum / len(enemy_non_defenders)])
            
            friendly_non_defenders_vs_average_enemy_non_defender.sort(key = lambda k: k[1] * -1)
            print(friendly_non_defenders_vs_average_enemy_non_defender)

            friendly_non_defenders_to_discard = []
            for i in range(2, len(friendly_non_defenders_vs_average_enemy_non_defender)):
                friendly_non_defenders_to_discard.append(friendly_non_defenders_vs_average_enemy_non_defender[i][0])

            if friendly_team_permutation.attacker_A in friendly_non_defenders_to_discard or friendly_team_permutation.attacker_B in friendly_non_defenders_to_discard:
                restricted_game_permutations.remove(game_permutation)
                print("removed")

            return restricted_game_permutations

    return game_permutations



