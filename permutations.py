import itertools # standard libraries

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

def get_game_permutations(matrix, draft_stage, n):
    friends = [friend for friend in matrix]
    enemies = [enemy for enemy in matrix[friends[0]]]
    
    friendly_team_permutations = get_team_permutations(draft_stage, n, friends)
    enemy_team_permutations = get_team_permutations(draft_stage, n, enemies)

    product = itertools.product(friendly_team_permutations, enemy_team_permutations)
    game_permutations = [GamePermutation(element[0], element[1]) for element in product]

    return game_permutations