from drafter.store.Settings import Settings
from drafter.store.Team import Team


class Store:
    def __init__(self):
        self.enemy_team = Team()
        self.friendly_team = Team("Norway")
        self.settings = Settings()
        # Dictionary of gamestates
        self.pairing = {}
        self.map_importance = {}
        self.transposed_pairing = {}


