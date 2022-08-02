import time # standard libraries

import utilities # local source
import generator
import teampermutation

def run(match, restrict_attackers):
    print("Starting script...")

    pairing_dictionary = utilities.import_pairing_dictionary(match)

    if (restrict_attackers):
        teampermutation.enable_restricted_attackers(pairing_dictionary, 3)

    strategy_dictionaries = generator.get_strategy_dictionaries(pairing_dictionary, False, True, False)

    #eight_player_select_defender_strategies = strategy_dictionaries["eight_player_select_defender_strategies"]

t0 = time.time()

run("Germany", True)

print(time.time() - t0)