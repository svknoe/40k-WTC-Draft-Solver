from dataclasses import dataclass  # standard libraries
from enum import Enum

import numpy as np  # 3rd party packages


class Defender(Enum):
    FRIENDLY = 0
    ENEMY = 1


# All pairing values for one match as index-keyed numpy arrays (GitHub issue #13,
# B2). Rows are friendly players, columns enemy players, both in NAME-SORTED index
# order (see context.NameIndex); every value is from the friendly side's
# perspective. Replaces the name-keyed dicts and the free functions
# utilities.get_pairing_value / get_neutral_value. The defender-picks-the-map rule
# (11th-edition, PLAN.md workstream C) lives in `value`.
@dataclass(eq=False)
class PairingTables:
    best: np.ndarray                  # (n_friendly, n_enemy)
    worst: np.ndarray
    neutral_weight: float

    @classmethod
    def from_dicts(cls, best, worst, friendly, enemy, neutral_weight):
        """Build the arrays from the name-keyed CSV dicts and the two NameIndex
        maps ({friendly_name: {enemy_name: value}})."""
        best_array = np.zeros((len(friendly.names), len(enemy.names)), dtype=float)
        worst_array = np.zeros_like(best_array)

        for source, target in ((best, best_array), (worst, worst_array)):
            for friendly_name, row in source.items():
                i = friendly.index(friendly_name)
                for enemy_name, value in row.items():
                    target[i, enemy.index(enemy_name)] = value

        return cls(best_array, worst_array, neutral_weight)

    # A friendly defender gets the pairing's best-map value, an enemy defender
    # forces the worst-map value, and games without a defender (refused-vs-refused,
    # last players) fall neutral_weight of the way from worst to best.
    def value(self, friendly_index, enemy_index, defender=None):
        if defender is None:
            best_value = self.best[friendly_index, enemy_index]
            worst_value = self.worst[friendly_index, enemy_index]
            return float(worst_value + self.neutral_weight * (best_value - worst_value))
        elif defender == Defender.FRIENDLY:
            return float(self.best[friendly_index, enemy_index])
        elif defender == Defender.ENEMY:
            return float(self.worst[friendly_index, enemy_index])
        else:
            raise ValueError("Unknown defender: {}".format(defender))

    # The full neutral (no-defender) matrix, for the k-restriction heuristic.
    def neutral_matrix(self):
        return self.worst + self.neutral_weight * (self.best - self.worst)
