from dataclasses import dataclass  # standard libraries
from typing import Any


# Index <-> name bridge for one team (GitHub issue #13, B2). Player indices are
# assigned in NAME-SORTED order, deliberately matching the ordering the string-key
# engine used everywhere (TeamPermutation sorted names), so switching to packed
# integer keys is a pure relabelling: enumeration order, payoff-matrix row/column
# order and equilibrium selection are all unchanged. Names live only here, at the
# presentation layer.
@dataclass(frozen=True)
class NameIndex:
    names: tuple            # index -> name, name-sorted
    index_of: dict          # name -> index

    def name(self, index):
        return self.names[index]

    def index(self, name):
        return self.index_of[name]

    @classmethod
    def from_names(cls, names):
        ordered = tuple(sorted(names))
        return cls(ordered, {name: i for i, name in enumerate(ordered)})


# All the knobs that used to live as mutable module-level globals in
# drafter/data/settings.py. Frozen so a solve can't silently mutate its own
# configuration mid-run; build a new one to change a knob (GitHub issue #13,
# B2 solver-context refactor). Defaults match the old settings.py values.
@dataclass(frozen=True)
class SolverConfig:
    friendly_team_name: str = "Norway"
    show_friendly_strategy_suggestions: bool = True
    show_enemy_strategy_suggestions: bool = True
    # User inserts the chosen enemy attacker instead of the discarded one.
    invert_discard_attackers: bool = True
    # A friendly player can't have the same name as an enemy player.
    require_unique_names: bool = True
    # Map value for games where neither player is a defender (refused-vs-refused
    # and last-players games), as a fraction of the way from the worst-map value
    # to the best-map value. 0.5 = midpoint, a 50/50 model of who ends up with
    # map advantage (PLAN.md workstream C).
    neutral_map_weight: float = 0.5
    # JSON cache read/write toggles.
    read_gamestates: bool = True
    write_gamestates: bool = True
    read_strategies: bool = True
    write_strategies: bool = True
    # Maximum number of attacker players considered by each team in each select
    # attackers step. Default 4. Decrease to 3 for shorter runtime, increase to
    # 5 for better precision.
    restrict_attackers: bool = True
    restricted_attackers_count: int = 4


# Everything one solve run needs, passed around explicitly instead of read from
# module-level globals (GitHub issue #13). Replaces drafter.data.match_info, the
# mutable drafter.data.settings, the restrict-attackers caches that used to live
# in drafter.common.team_permutation, and the gamestate/strategy dictionaries
# that used to be module globals in the solver package. Gamestate keys are packed
# integers (drafter.common.packing); the friendly/enemy NameIndex maps here are
# the only place player names live.
@dataclass
class SolverContext:
    config: SolverConfig
    enemy_team_name: Any
    friendly: NameIndex               # index <-> name for the friendly team
    enemy: NameIndex                  # index <-> name for the enemy team
    pairing: Any                      # drafter.common.pairing.PairingTables
    restriction: Any                  # team_permutation.RestrictionData | None
    gamestate_dictionaries: dict
    strategy_dictionaries: dict
    game_solution_caches: dict
