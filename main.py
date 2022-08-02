import time # standard libraries

import utilities # local source
import generator
import teampermutation

read = False
write = True
restrict_attackers = True
round_strategies = False

def run(match, restrict_attackers):
    print("Starting script...")

    strategy_dictionaries = generator.get_strategy_dictionaries(match, read, write, restrict_attackers, round_strategies)

    #eight_player_select_defender_strategies = strategy_dictionaries["eight_player_select_defender_strategies"]

t0 = time.time()

run("Germany", True)

print(time.time() - t0)