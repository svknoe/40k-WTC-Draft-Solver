import itertools  # standard libraries
from copy import deepcopy
from dataclasses import dataclass
from enum import Enum

import drafter.common.utilities as utilities  # local source
import drafter.common.packing as packing
from drafter.common.draft_stage import DraftStage


class Side(Enum):
    FRIENDLY = 0
    ENEMY = 1


# Precomputed pairing lookups for the k-restriction heuristic (which attackers a
# team plausibly fields against a given defender). Built once per solve from the
# match's PairingTables; replaces the module-level globals that used to be set by
# enable_restricted_attackers() (GitHub issue #13). All arrays are indexed by
# name-sorted player index and hold values from the friendly side's perspective:
# friendly_* arrays are (n_friendly, n_enemy), enemy_* arrays are (n_enemy,
# n_friendly) so [attacker, opponent] indexing works for either side.
@dataclass(eq=False)
class RestrictionData:
    k: int
    friendly_vs_defender: object
    friendly_vs_field: object
    enemy_vs_defender: object
    enemy_vs_field: object


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
        return packing.encode_team_permutation(
            packing.mask_from_indices(self.remaining_players),
            self.defender, self.attacker_A, self.attacker_B, self.discarded_attacker)

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


def get_team_permutation_from_key(code):
    remaining_mask, defender, attacker_A, attacker_B, discarded_attacker = \
        packing.decode_team_permutation(code)
    remaining_players = packing.indices_from_mask(remaining_mask)

    return TeamPermutation(remaining_players, defender, attacker_A, attacker_B, discarded_attacker)


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


def get_team_permutations_for_stage(ctx, side, draft_stage, parent_team_permutation, opposing_parent_team_permutation):
    if (draft_stage == DraftStage.none):
        return [get_none_team_permutation(parent_team_permutation)]
    elif (draft_stage == DraftStage.select_defender):
        return get_defender_team_permutations(parent_team_permutation)
    elif (draft_stage == DraftStage.select_attackers):
        return get_attackers_team_permutations(ctx, side, parent_team_permutation, opposing_parent_team_permutation)
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


def get_attackers_team_permutations(ctx, side, defender_team_permutation, opposing_defender_team_permutation):
    defender = defender_team_permutation.defender

    if defender is None:
        raise ValueError("Missing defender.")

    eligable_attackers = defender_team_permutation.remaining_players

    if (ctx.restriction is not None):
        eligable_attackers = get_heuristically_best_attackers(
            ctx.restriction, side, eligable_attackers, opposing_defender_team_permutation)

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


def build_restriction(pairing, k):
    neutral_matrix = pairing.neutral_matrix()

    # All values are from the friendly side's perspective. An attacker plays the
    # opposing defender, who picks the map: a friendly attacker gets the pairing's
    # worst-map value, an enemy attacker faces the friendly defender's best-map
    # value. Games against the rest of the field have no defender yet, so they
    # use the neutral (weighted-midpoint) value. Enemy arrays are transposed so
    # [attacker, opponent] indexes an (enemy, friendly) pair.
    return RestrictionData(
        k=k,
        friendly_vs_defender=pairing.worst,
        friendly_vs_field=neutral_matrix,
        enemy_vs_defender=pairing.best.T,
        enemy_vs_field=neutral_matrix.T)


def get_heuristically_best_attackers(restriction, side, eligable_attackers, opposing_defender_team_permutation):
    # The friendly side maximises the pairing value, the enemy side minimises it,
    # so the two sides rank an attacker's relative advantage in opposite
    # directions. The explicit `side` replaces the old trick of sniffing which
    # pairing dictionary an attacker name appeared in (GitHub issue #13).
    if side == Side.FRIENDLY:
        vs_defender_array = restriction.friendly_vs_defender
        vs_field_array = restriction.friendly_vs_field
        ranking_sign = -1
    else:
        vs_defender_array = restriction.enemy_vs_defender
        vs_field_array = restriction.enemy_vs_field
        ranking_sign = 1

    opposing_defender = opposing_defender_team_permutation.defender
    opposing_remaining = opposing_defender_team_permutation.remaining_players

    attackers_with_relative_advantages_against_defender = []

    for attacker in eligable_attackers:
        vs_defender = vs_defender_array[attacker][opposing_defender]
        vs_field = sum([vs_field_array[attacker][opponent] for opponent in opposing_remaining]) \
            / len(opposing_remaining)

        relative_advantage = vs_defender - vs_field
        attackers_with_relative_advantages_against_defender.append([attacker, relative_advantage])

    ranked_attackers = sorted(attackers_with_relative_advantages_against_defender, key=lambda entry: (ranking_sign * entry[1]))
    restricted_attackers_with_relatives_advantages = ranked_attackers[0:restriction.k]
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