import time # standard libraries

import drafter.common.utilities as utilities  # local source
import drafter.common.teampermutation as teampermutation
import drafter.solver.strategydictionaries as strategydictionaries
import drafter.solver.gamestatedictionaries as gamestatedictionaries
import drafter.solver.draft as draft

# Settings
friendly_team_name = "Norway"
show_friendly_strategy_suggestions = True
show_enemy_strategy_suggestions = True

# Configuration
read_gamestates = True
write_gamestates = True

read_strategies = True
write_strategies = True

restrict_attackers = True
restricted_attackers_count = 4 # Maximum number of attacker players considered by each team in each select attackers step.

def run():
    utilities.friendly_team_name = friendly_team_name
    utilities.enemy_team_name = input("Select enemy team by entering the name of a folder in ..\\drafter\\resources\\matches:\n")
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
    utilities.initialise_input_dictionary(utilities.pairing_dictionary, "pairing_matrix.txt", True)
    utilities.initialise_input_dictionary(utilities.map_importance_dictionary, "map_importance_matrix.txt", False)

    if (restrict_attackers):
        teampermutation.enable_restricted_attackers(restricted_attackers_count)

    t0 = time.time()
    print()
    print("Initialising gamestate dictionaries (This might take a few minutes):")
    gamestatedictionaries.initialise_dictionaries(read_gamestates, write_gamestates)
    print("time: {}s".format(round(time.time() - t0, 2)))

    t0 = time.time()
    print()
    if read_strategies:
        print("Initialising strategy dictionaries (This might take a few minutes):")
    else:
        if restrict_attackers and restricted_attackers_count < 4:
            print("Initialising strategy dictionaries (This might take a few minutes):")
        elif restrict_attackers and restricted_attackers_count < 5:
            print("Initialising strategy dictionaries (This might take an hour.):")
        else:
            print("Initialising strategy dictionaries (This might take many hours. Enable restrict_attackers with restricted_attackers_count < 5 to reduce runtime.):")
    strategydictionaries.initialise_dictionaries(read_strategies, write_strategies)
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