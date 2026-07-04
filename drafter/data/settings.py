# Settings
friendly_team_name = "Norway"
show_friendly_strategy_suggestions = True
show_enemy_strategy_suggestions = True
invert_discard_attackers = True  # User to insert chosen enemy attacker instead of discarded enemy attacker.
require_unique_names = True  # A friendly player can't have the same name as an enemy player.

# Map value used for games where neither player is a defender (refused-vs-refused
# and last-players games), as a fraction of the way from the worst-map value to
# the best-map value. 0.5 = midpoint, a 50/50 model of who ends up with map
# advantage (PLAN.md workstream C).
neutral_map_weight = 0.5

# Configuration
read_gamestates = True
write_gamestates = True

read_strategies = True
write_strategies = True

# Maximum number of attacker players considered by each team in each select attackers step.
restrict_attackers = True
restricted_attackers_count = 4 # Default 4. Decrease to 3 for shorter runtimer, increase to 5 for better precision at.