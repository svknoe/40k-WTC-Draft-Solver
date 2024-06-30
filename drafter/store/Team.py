class Team:
    def __init__(self, name: str = None, show_strategy_sugegstions: bool = True):
        self.name: str = None
        """ Name of the team. """
        self.show_strategy_sugegstions: bool = True
        """ Show strategy suggestions for this team. """