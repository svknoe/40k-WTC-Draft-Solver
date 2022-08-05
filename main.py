import time # standard libraries

import utilities # local source
import strategydictionaries
import gamestatedictionaries
import teampermutation
import draft

# Settings
friendly_team_name = "Norway"
show_friendly_strategy_suggestions = True
show_enemy_strategy_suggestions = True

# Configuration
read = True
write = False
restrict_attackers = True
restricted_attackers_count = 4
round_strategies = False

def run():
    utilities.friendly_team_name = friendly_team_name
    utilities.enemy_team_name = "Germany" # Select match
    utilities.show_friendly_strategy_suggestions = show_friendly_strategy_suggestions
    utilities.show_enemy_strategy_suggestions = show_enemy_strategy_suggestions

    initialise()

    while True:
        draft.play_draft()
        time.sleep(1)
        draft_again = prompt_draft_again()
        if not draft_again:
            break

def initialise():
    utilities.initialise_pairing_dictionary()

    if (restrict_attackers):
        teampermutation.enable_restricted_attackers(restricted_attackers_count)

    t0 = time.time()
    print("Initialising gamestate dictionaries:")
    gamestatedictionaries.initialise_dictionaries(read, write)
    print("time: {}s".format(round(time.time() - t0, 2)))

    t0 = time.time()
    print("Initialising strategy dictionaries:")
    strategydictionaries.initialise_dictionaries(read, write)
    print("time: {}s".format(round(time.time() - t0, 2)))

def prompt_draft_again():
    def valid_input(prompt_input):
        if prompt_input == "" or prompt_input == "y" or prompt_input == "n":
            return True

        return False

    user_input = None

    while not valid_input(user_input):
        user_input = input("Draft again? ([y] / n)\n")

    if user_input == "n":
        return False

    return True

run()