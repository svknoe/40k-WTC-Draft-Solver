from time import time # standard libraries
import numpy as np

import utilities # local source

t0 = time()

four_player_select_defender_strategies = utilities.read_strategy_dictionary("four_player_select_defender_dictionary.json")

print(time()-t0)