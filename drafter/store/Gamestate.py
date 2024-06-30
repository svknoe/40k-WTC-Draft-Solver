import numpy as np


class GameState:
    def __init__(self):
        self.allies = []
        self.enemies = []
        self.matrix = np.array([])
        self.transposed_matrix = np.array([])