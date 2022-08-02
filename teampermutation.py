from argparse import ArgumentError
import itertools # standard libraries
from copy import deepcopy

import utilities # local source

restrict_attackers_k = None
regular_pairing_dictionary = None
transposed_pairing_dictionary = None

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

def get_team_permutations_for_stage(draft_stage, parent_team_permutation, opposing_parent_team_permutation):
    if (draft_stage == utilities.DraftStage.none):
        return [get_none_team_permutation(parent_team_permutation)]
    elif (draft_stage == utilities.DraftStage.select_defender):
        return get_defender_team_permutations(parent_team_permutation)
    elif (draft_stage == utilities.DraftStage.select_attackers):
        return get_attackers_team_permutations(parent_team_permutation, opposing_parent_team_permutation)
    elif (draft_stage == utilities.DraftStage.discard_attackers):
        return get_discard_team_permutations(parent_team_permutation)
    else:
        raise ValueError("{} is an unknown draft stage.".format(draft_stage))

def get_defender_team_permutations(none_team_permutation):
    size = len(none_team_permutation.remaining_players)
    if (not (size == 4 or size == 6 or size == 8)):
        raise ValueError("{} is an incorrect number of players.".format(size))
    
    defender_team_permutations = []

    for defender in none_team_permutation.remaining_players:
        non_defenders = none_team_permutation.remaining_players.copy()
        non_defenders.remove(defender)
        defender_team_permutations.append(TeamPermutation(non_defenders, defender))
    
    return defender_team_permutations

def get_attackers_team_permutations(defender_team_permutation, opposing_defender_team_permutation):
    defender = defender_team_permutation.defender

    if defender == None:
        raise ValueError("Missing defender.")

    eligable_attackers = defender_team_permutation.remaining_players

    if (restrict_attackers_k != None):
        eligable_attackers = get_heuristically_best_attackers(eligable_attackers, opposing_defender_team_permutation)

    attacker_combinations = itertools.combinations(eligable_attackers, 2)
    attackers_team_permutations = []

    for attacker_combination in attacker_combinations:
        attacker_A = attacker_combination[0]
        attacker_B = attacker_combination[1]
        remaining_players = defender_team_permutation.remaining_players.copy()
        remaining_players.remove(attacker_A)
        remaining_players.remove(attacker_B)
        attackers_team_permutations.append(TeamPermutation(remaining_players, defender, attacker_A, attacker_B))

    return attackers_team_permutations

def enable_restricted_attackers(pairing_dictionary, k):
    global restrict_attackers_k, regular_pairing_dictionary, transposed_pairing_dictionary
    restrict_attackers_k = k
    regular_pairing_dictionary = pairing_dictionary
    transposed_pairing_dictionary = utilities.get_transposed_pairing_dictionary(pairing_dictionary)

def get_heuristically_best_attackers(eligable_attackers, opposing_defender_team_permutation):
    if eligable_attackers[0] in regular_pairing_dictionary:
        pairing_dictionary = regular_pairing_dictionary
    elif eligable_attackers[0] in transposed_pairing_dictionary:
        pairing_dictionary = transposed_pairing_dictionary
    else:
        raise ArgumentError("Inconsistent pairing matrices.")

    attackers_with_relative_advantages_against_defender = []

    for attacker in eligable_attackers:
        vs_defender = pairing_dictionary[attacker][opposing_defender_team_permutation.defender]
        vs_field = sum([pairing_dictionary[attacker][opponent] for opponent in opposing_defender_team_permutation.remaining_players])/len(opposing_defender_team_permutation.remaining_players)
        relative_advantage = vs_defender - vs_field
        attackers_with_relative_advantages_against_defender.append([attacker, relative_advantage])

    ranked_attackers = sorted(attackers_with_relative_advantages_against_defender , key=lambda k: (-k[1]))
    restricted_attackers_with_relatives_advantages = ranked_attackers[0:restrict_attackers_k]
    restricted_attackers = [pair[0] for pair in restricted_attackers_with_relatives_advantages]

    return restricted_attackers

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
    team_players = discard_team_permutation.remaining_players.copy()
    discarded_attacker = discard_team_permutation.discarded_attacker

    if discarded_attacker != None:
        team_players = team_players + [discarded_attacker]

    none_team_permutation = TeamPermutation(team_players)
    return none_team_permutation