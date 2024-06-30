class Settings:
    def __init__(self):
        self.invert_discard_attackers: bool = True
        """ Used to insert chosen enemy attacker instead of discarded enemy attacker."""
        self.require_unique_names: bool = True
        """ A friendly player can't have the same name as an enemy player. """
        # Gamestates configuration
        self.read_gamestates: bool = True
        self.write_gamestates: bool = True
        # Strategy configuration
        self.read_strategies: bool = True
        self.write_strategies: bool = True
        # Maximum number of attacker players considered by each team in each select attackers step.
        self.restrict_attackers: bool = True
        """ Explain what this is for """
        self.restricted_attackers_count: int = 4
        """ Explain what this is for """