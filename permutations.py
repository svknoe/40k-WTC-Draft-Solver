import itertools # standard libraries

import utilities # local source

class TeamPermutation:
    def __init__(self, remaining_players, defender = None, attacker_A = None, attacker_B = None, discarded_attacker = None):
        self.defender = defender
        self.attacker_A = attacker_A
        self.attacker_B = attacker_B
        self.discarded_attacker = discarded_attacker
        self.remaining_players = remaining_players

    def get_permutation_key(self):
        permutation_key = ""

        if self.defender != None:
            permutation_key += "Defender" + self.defender + ", "

        if self.attacker_A != None:
            permutation_key += "Attacker A" + self.attacker_A + ", "

        if self.attacker_B != None:
            permutation_key += "Attacker B" + self.attacker_B + ", "

        if self.discarded_attacker != None:
            permutation_key += "Discarded attacker" + self.discarded_attacker + ", "

        permutation_key += "Remaining players: "

        for i in range(0, len(self.remaining_players)):
            permutation_key += self.remaining_players[i]            
            if (i < len(self.remaining_players) - 1):
                permutation_key += ", "

        return permutation_key

def get_team_permutation(draft_stage, players):
    players_clone = players.copy()
    defender = None
    attacker_A = None
    attacker_B = None
    discarded_attacker = None
    
    if (draft_stage.Value > 0):
        defender = players_clone.pop(0)

    if (draft_stage.Value > 1):
        attacker_A = players_clone.pop(0)
        attacker_B = players_clone.pop(0)

    if (draft_stage.Value > 2):
        discarded_attacker = players_clone.pop(0)

    return TeamPermutation(players_clone, defender, attacker_A, attacker_B, discarded_attacker)

class GamePermutation:
    def __init__(self, friendly_team, enemy_team):
        self.friendly_team = friendly_team
        self.enemy_team = enemy_team

    def get_permutation_key(self):
        return "Friends: {}, \nEnemies: {}".format(self.friendly_team.get_permutation_key(), self.enemy_team.get_permutation_key())

def get_game_permutation(draft_stage, friends, enemies):
    friendly_team = get_team_permutation(draft_stage, friends)
    enemy_team = get_team_permutation(draft_stage, enemies)

    return GamePermutation(friendly_team, enemy_team)

def get_discard_attacker_team_permutations(n, players):
    player_combinations = itertools.combinations(players, n)

    print("n:{}, combinations:{}".format(n, len(player_combinations)))

    team_permutations = []
    
    for combination in player_combinations:
        combination_permutations = []

        for defender in combination:
            non_defenders = list(combination).copy()
            non_defenders.remove(defender)

            for i in range(0, len(non_defenders) - 1):
                attacker_A = non_defenders[i]

                for j in range(i + 1, len(non_defenders)):
                    attacker_B = non_defenders[j]

                    remaining_players = non_defenders.copy()
                    remaining_players.remove(attacker_A)
                    remaining_players.remove(attacker_B)

                    team_permutation = TeamPermutation(remaining_players, defender, attacker_A, attacker_B)
                    combination_permutations.append(team_permutation)
                    
                    if "Michal Gemmeke" in combination:
                        if (list(combination) == ["Michal Gemmeke", "Matthias Bellmann", "Martin Nguyen", "Immanuel Wolf"]):
                            print("FOO")

        team_permutations.extend(combination_permutations)
        
    return team_permutations

def get_discard_attacker_game_permutations(matrix, n):
    friends = [friend for friend in matrix]
    enemies = [enemy for enemy in matrix[friends[0]]]
    
    friend_permutations = get_discard_attacker_player_permutations(friends, n)
    enemy_permutations = get_discard_attacker_player_permutations(enemies, n)

    if ["Michal Gemmeke", "Matthias Bellmann", "Martin Nguyen", "Immanuel Wolf"] in enemy_permutations:
        print("bar") # TODO WORKING HERE!

    product = itertools.product(friend_permutations, enemy_permutations)
    game_permutations = [[list(element[0]), list(element[1])] for element in product]
