import itertools  # standard libraries
from argparse import ArgumentError
from copy import deepcopy
import re

import drafter.common.utilities as utilities  # local source
from drafter.common.draft_stage import DraftStage
import drafter.data.match_info as match_info

restrict_attackers_k = None
regular_pairing_dictionary = None
transposed_pairing_dictionary = None


class TeamPermutation:
    def __init__(self, remaining_players, defender=None, attacker_A=None, attacker_B=None, discarded_attacker=None):

        self.defender = defender

        if attacker_A is not None and attacker_B is not None:
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

        if self.defender is not None:
            permutation_key += "{{Defender: {}}}".format(self.defender) + ", "

        if self.attacker_A is not None:
            permutation_key += "{{Attacker A: {}}}".format(self.attacker_A) + ", "

        if self.attacker_B is not None:
            permutation_key += "{{Attacker B: {}}}".format(self.attacker_B) + ", "

        if self.discarded_attacker is not None:
            permutation_key += "{{Discarded attacker: {}}}".format(self.discarded_attacker) + ", "

        permutation_key += "{{Remaining players: {}}}".format(", ".join(self.remaining_players))

        return permutation_key

    def get_draft_stage(self):
        if self.discarded_attacker is not None:
            return DraftStage.discard_attacker
        elif self.attacker_A is not None:
            return DraftStage.select_attackers
        elif self.defender is not None:
            return DraftStage.select_defender
        else:
            return DraftStage.none

    def get_n(self):
        n = len(self.remaining_players)
        if self.defender is not None:
            n += 1
        if self.attacker_A is not None:
            n += 1
        if self.attacker_B is not None:
            n += 1

        return n

    def select_defender(self, defender):
        if defender not in self.remaining_players:
            raise ValueError("Unknown player {}.".format(defender))

        self.defender = defender
        self.remaining_players.remove(defender)

    def select_attackers(self, attacker_A, attacker_B):
        if attacker_A not in self.remaining_players:
            raise ValueError("Unknown player {}.".format(attacker_A))

        self.attacker_A = attacker_A
        self.remaining_players.remove(attacker_A)

        if attacker_B not in self.remaining_players:
            raise ValueError("Unknown player {}.".format(attacker_B))

        self.attacker_B = attacker_B
        self.remaining_players.remove(attacker_B)

    def select_discarded_attacker(self, discarded_attacker):
        if not (discarded_attacker == self.attacker_A or discarded_attacker == self.attacker_B):
            raise ValueError("Unknown player {}.".format(discarded_attacker))

        self.discarded_attacker = discarded_attacker

    def get_nondiscarded_attacker(self, discarded_attacker_override=None):
        discarded_attacker = self.discarded_attacker

        if discarded_attacker_override is not None:
            discarded_attacker = discarded_attacker_override

        if discarded_attacker is None:
            return None
        elif discarded_attacker == self.attacker_A:
            return self.attacker_B
        elif discarded_attacker == self.attacker_B:
            return self.attacker_A
        else:
            raise ValueError("Unknown discarded attacker: {}".format(discarded_attacker))


def get_team_permutation_from_key(key):
    role_string, remaining_players_string = key.split("{Remaining players: ", 1)

    remaining_players_string = remaining_players_string.strip('}')
    remaining_players = remaining_players_string.split(', ')

    defender = None
    attacker_A = None
    attacker_B = None
    discarded_attacker = None

    groups = re.findall(r'\{.*?\}', role_string)
    for group in groups:
        role, player = group.split(': ')
        role = role.strip('{')
        player = player.strip('}')

        if role == "Defender":
            defender = player
        elif role == "Attacker A":
            attacker_A = player
        elif role == "Attacker B":
            attacker_B = player
        elif role == "Discarded attacker":
            discarded_attacker = player
        else:
            raise ValueError("Unknown role {}.".format(role))

    return(TeamPermutation(remaining_players, defender, attacker_A, attacker_B, discarded_attacker))


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
                        team_permutations.append(
                            TeamPermutation(remaining_players, defender, attacker_A, attacker_B))
                        continue

                    team_permutations.append(
                        TeamPermutation(remaining_players, defender, attacker_A, attacker_B, attacker_A))

                    team_permutations.append(
                        TeamPermutation(remaining_players, defender, attacker_A, attacker_B, attacker_B))

    return team_permutations


def get_team_permutations_for_stage(draft_stage, parent_team_permutation, opposing_parent_team_permutation):
    if (draft_stage == DraftStage.none):
        return [get_none_team_permutation(parent_team_permutation)]
    elif (draft_stage == DraftStage.select_defender):
        return get_defender_team_permutations(parent_team_permutation)
    elif (draft_stage == DraftStage.select_attackers):
        return get_attackers_team_permutations(parent_team_permutation, opposing_parent_team_permutation)
    elif (draft_stage == DraftStage.discard_attacker):
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

    if defender is None:
        raise ValueError("Missing defender.")

    eligable_attackers = defender_team_permutation.remaining_players

    if (restrict_attackers_k is not None):
        eligable_attackers = get_heuristically_best_attackers(
            eligable_attackers, opposing_defender_team_permutation)

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


def enable_restricted_attackers(k):
    global restrict_attackers_k, regular_pairing_dictionary, transposed_pairing_dictionary
    restrict_attackers_k = k
    regular_pairing_dictionary = match_info.pairing_dictionary
    transposed_pairing_dictionary = utilities.get_transposed_pairing_dictionary()


def get_heuristically_best_attackers(eligable_attackers, opposing_defender_team_permutation):
    ranking_sign = -1
    if eligable_attackers[0] in regular_pairing_dictionary:
        pairing_dictionary = regular_pairing_dictionary
    elif eligable_attackers[0] in transposed_pairing_dictionary:
        pairing_dictionary = transposed_pairing_dictionary
        ranking_sign *= -1
    else:
        raise ArgumentError("Inconsistent pairing matrices.")

    attackers_with_relative_advantages_against_defender = []

    for attacker in eligable_attackers:
        vs_defender = pairing_dictionary[attacker][opposing_defender_team_permutation.defender]
        vs_field = sum([pairing_dictionary[attacker][opponent] for opponent in opposing_defender_team_permutation.remaining_players]) \
            / len(opposing_defender_team_permutation.remaining_players)

        relative_advantage = vs_defender - vs_field
        attackers_with_relative_advantages_against_defender.append([attacker, relative_advantage])

    ranked_attackers = sorted(attackers_with_relative_advantages_against_defender, key=lambda k: (ranking_sign * k[1]))
    restricted_attackers_with_relatives_advantages = ranked_attackers[0:restrict_attackers_k]
    restricted_attackers = [pair[0] for pair in restricted_attackers_with_relatives_advantages]

    return restricted_attackers


def get_discard_team_permutations(attackers_team_permutation):
    attacker_A = attackers_team_permutation.attacker_A
    attacker_B = attackers_team_permutation.attacker_B

    if (attacker_A is None or attacker_B is None):
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

    if discarded_attacker is not None:
        team_players = team_players + [discarded_attacker]

    none_team_permutation = TeamPermutation(team_players)
    return none_team_permutation