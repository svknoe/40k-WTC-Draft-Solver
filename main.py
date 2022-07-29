import time # standard libraries

import utilities # local source
import generator

t0 = time.time()

print("Starting script...")
strategy_dictionaries = generator.get_strategy_dictionaries("Germany", False)

eight_player_select_defender_strategies = strategy_dictionaries["eight_player_select_defender_strategies"]
print(len(eight_player_select_defender_strategies))
print(eight_player_select_defender_strategies)

print(time.time() - t0)