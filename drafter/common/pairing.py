from dataclasses import dataclass  # standard libraries

import drafter.common.utilities as utilities  # local source


# All pairing values for one match, bundled with the neutral-map weight so the
# defender-picks-the-map rule (11th-edition, PLAN.md workstream C) lives in one
# place instead of reading module-level globals. Replaces the old
# match_info.pairing_dictionary_best/worst + settings.neutral_map_weight trio
# and the free functions utilities.get_pairing_value / get_pairing_string /
# get_neutral_value (GitHub issue #13, B2 solver-context refactor). The tables
# stay name-keyed dicts ({friendly: {enemy: value}}) at this step; the packed
# integer encoding (B2 second PR) turns them into index-keyed arrays.
@dataclass(frozen=True)
class PairingTables:
    best: dict
    worst: dict
    neutral_weight: float

    # The defender picks the map: a friendly defender gets the pairing's best-map
    # value, an enemy defender forces the worst-map value, and games without a
    # defender (refused-vs-refused, last players) fall neutral_weight of the way
    # from worst to best.
    def value(self, friendly_player, enemy_player, defender=None):
        best_value = utilities.get_value_from_input_dictionary(self.best, friendly_player, enemy_player)
        worst_value = utilities.get_value_from_input_dictionary(self.worst, friendly_player, enemy_player)

        if defender is None:
            return worst_value + self.neutral_weight * (best_value - worst_value)
        elif friendly_player == defender:
            return best_value
        elif enemy_player == defender:
            return worst_value
        else:
            raise ValueError("Unknown defender: {}".format(defender))

    def pairing_string(self, friendly_player, enemy_player, defender=None):
        value = self.value(friendly_player, enemy_player, defender)

        friendly_player_string = friendly_player
        enemy_player_string = enemy_player

        if defender is not None:
            if friendly_player == defender:
                friendly_player_string += " (D)"
            elif enemy_player == defender:
                enemy_player_string += " (D)"
            else:
                raise ValueError("Unknown defender: {}".format(defender))

        return round(value, 2), "{} vs {}".format(friendly_player_string, enemy_player_string)

    # The full neutral (no-defender) matrix, used by the k-restriction heuristic
    # to value an attacker's games against the yet-undefended field.
    def neutral_dictionary(self):
        neutral_pairing_dictionary = {}

        for friend in self.best:
            row = {}
            for enemy in self.best[friend]:
                best_value = self.best[friend][enemy]
                worst_value = self.worst[friend][enemy]
                row[enemy] = worst_value + self.neutral_weight * (best_value - worst_value)
            neutral_pairing_dictionary[friend] = row

        return neutral_pairing_dictionary
