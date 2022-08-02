import itertools # standard libraries
from copy import deepcopy

import utilities # local source

class GamePermutation:
    def __init__(self, friendly_team_permutation, enemy_team_permutation):
        self.friendly_team_permutation = friendly_team_permutation
        self.enemy_team_permutation = enemy_team_permutation

    def get_key(self):
        return "Friends: {}\nEnemies: {}".format(self.friendly_team_permutation.get_key(), self.enemy_team_permutation.get_key())

def get_game_permutation(draft_stage, friends, enemies):
    friendly_team_permutation = get_team_permutation(draft_stage, friends)
    enemy_team_permutation = get_team_permutation(draft_stage, enemies)

    return GamePermutation(friendly_team_permutation, enemy_team_permutation)

def get_game_permutations(matrix, draft_stage, n, restrict_attackers):
    friends = [friend for friend in matrix]
    enemies = [enemy for enemy in matrix[friends[0]]]
    
    friendly_team_permutations = get_team_permutations(draft_stage, n, friends)
    enemy_team_permutations = get_team_permutations(draft_stage, n, enemies)

    product = itertools.product(friendly_team_permutations, enemy_team_permutations)
    game_permutations = [GamePermutation(element[0], element[1]) for element in product]

    print(draft_stage)
    if (False and restrict_attackers and draft_stage == utilities.DraftStage.select_defender):
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

def get_next_game_permutations(current_draft_stage, parent_game_permutation):
    next_friendly_team_permutations = get_next_team_permutations(current_draft_stage, parent_game_permutation.friendly_team_permutation)
    next_enemy_team_permutations = get_next_team_permutations(current_draft_stage, parent_game_permutation.enemy_team_permutation)
    next_game_permutations = utilities.get_cartesian_product(next_friendly_team_permutations, next_enemy_team_permutations)

    return next_game_permutations

class TeamPermutation:
    def __init__(self, remaining_players, defender = None, attacker_A = None, attacker_B = None, discarded_attacker = None):
        self.defender = defender

        if attacker_A != None and attacker_B != None:
            attackers = sorted([attacker_A, attacker_B])
            self.attacker_A = attackers[0]
            self.attacker_B = attackers[1]
        else:
            self.attacker_A = attacker_A
            self.attacker_B = attacker_B
            
        self.discarded_attacker = discarded_attacker
        self.remaining_players = sorted(remaining_players)


    def get_key(self):
        permutation_key = ""

        if self.defender != None:
            permutation_key += "{{Defender: {}}}".format(self.defender) + ", "

        if self.attacker_A != None:
            permutation_key += "{{Attacker A: {}}}".format(self.attacker_A) + ", "

        if self.attacker_B != None:
            permutation_key += "{{Attacker B: {}}}".format(self.attacker_B) + ", "

        if self.discarded_attacker != None:
            permutation_key += "{{Discarded attacker: {}}}".format(self.discarded_attacker) + ", "

        permutation_key += "{{Remaining players: {}}}".format(", ".join(self.remaining_players))

        return permutation_key

def get_team_permutation(draft_stage, players):
    players_clone = players.copy()
    defender = None
    attacker_A = None
    attacker_B = None
    discarded_attacker = None
    
    if (draft_stage.value > 0):
        defender = players_clone.pop(0)

    if (draft_stage.value > 1):
        attacker_A = players_clone.pop(0)
        attacker_B = players_clone.pop(0)

    if (draft_stage.value > 2):
        discarded_attacker = players_clone.pop(0)

    return TeamPermutation(players_clone, defender, attacker_A, attacker_B, discarded_attacker)

def get_team_permutations(draft_stage, n, team_players):
    player_combinations = itertools.combinations(team_players, n)
    team_permutations = []
    
    for player_combination in player_combinations:
        if (draft_stage.value < 1):
            team_permutations.append(TeamPermutation(player_combination))
            continue

        for defender in player_combination:
            non_defenders = list(player_combination).copy()
            non_defenders.remove(defender)

            if (draft_stage.value < 2):
                team_permutations.append(TeamPermutation(non_defenders, defender))
                continue

            for i in range(0, len(non_defenders) - 1):
                attacker_A = non_defenders[i]

                for j in range(i + 1, len(non_defenders)):
                    attacker_B = non_defenders[j]

                    remaining_players = non_defenders.copy()
                    remaining_players.remove(attacker_A)
                    remaining_players.remove(attacker_B)

                    if (draft_stage.value < 3):
                        team_permutations.append(TeamPermutation(remaining_players, defender, attacker_A, attacker_B))
                        continue

                    team_permutations.append(TeamPermutation(remaining_players, defender, attacker_A, attacker_B, attacker_A))
                    team_permutations.append(TeamPermutation(remaining_players, defender, attacker_A, attacker_B, attacker_B))

    return team_permutations

def get_next_team_permutations(current_draft_stage, parent_team_permutation):
    if (current_draft_stage == None):
        return get_defender_team_permutations(parent_team_permutation)

    next_draft_stage = utilities.get_next_draft_stage(current_draft_stage, None)[0]

    if (next_draft_stage == utilities.DraftStage.select_defender):
        none_team_permutation = get_none_team_permutation(parent_team_permutation)
        return get_defender_team_permutations(none_team_permutation)
    elif (next_draft_stage == utilities.DraftStage.select_attackers):
        return get_attackers_team_permutations(parent_team_permutation)
    elif (next_draft_stage == utilities.DraftStage.discard_attacker):
        return get_discard_team_permutations(parent_team_permutation)
    else:
        raise ValueError("{} is an unknown draft stage.".format(current_draft_stage))

def get_defender_team_permutations(team_permutation_stage_none):
    size = len(team_permutation_stage_none.remaining_players)
    if (not (size == 4 or size == 6 or size == 8)):
        raise ValueError("{} is an incorrect number of players.".format(size))
    
    defender_team_permutations = []

    for defender in team_permutation_stage_none:
        non_defenders = team_permutation_stage_none.remaining_players.copy()
        non_defenders.remove(defender)
        defender_team_permutations.append(TeamPermutation(non_defenders, defender))
    
    return defender_team_permutations

def get_attackers_team_permutations(defender_team_permutation):
    defender = defender_team_permutation.defender

    if defender == None:
        raise ValueError("Missing defender.")

    attacker_combinations = itertools.combinations(defender_team_permutation.remaining_players, 2)
    attackers_team_permutations = []

    for attacker_combination in attacker_combinations:
        attacker_A = attacker_combination[0]
        attacker_B = attacker_combination[1]
        remaining_players = defender_team_permutation.remaining_players.copy()
        remaining_players.remove(attacker_A)
        remaining_players.remove(attacker_B)
        attackers_team_permutations.append(TeamPermutation(remaining_players, defender, attacker_A, attacker_B))

    return attackers_team_permutations

def get_discard_team_permutations(attackers_team_permutation):
    attacker_A = attackers_team_permutation.attacker_A
    attacker_B = attackers_team_permutation.attacker_B

    if (attacker_A == None or attacker_B == None):
        raise ValueError("Missing attacker.")

    discard_options = [attacker_A, attacker_B]
    discard_team_permutations = []

    for discard_option in discard_options:
        discard_team_permutation = deepcopy(attackers_team_permutation)
        discard_team_permutation.discarded_attacker = discard_option
        discard_team_permutations.append(discard_team_permutation)
    
    return discard_team_permutations

def get_none_team_permutation(discard_team_permutation):
    if (discard_team_permutation.discarded_attacker == None):
        raise ValueError("Missing discarded attacker.")

    unselected_players = discard_team_permutation.remaining_players
    discarded_attacker = discard_team_permutation.discarded_attacker

    return TeamPermutation(unselected_players + [discarded_attacker])


