import time  # standard libraries

import drafter.common.utilities as utilities  # local source
import drafter.common.teampermutation as teampermutation
import drafter.data.settings as settings
import drafter.data.matchinfo as matchinfo
import drafter.solver.strategydictionaries as strategydictionaries
import drafter.solver.gamestatedictionaries as gamestatedictionaries
import drafter.solver.draft as draft


def run():
    enemy_team_prompt = "Select enemy team by entering the name of a folder in ..\\drafter\\resources\\matches:\n"
    matchinfo.enemy_team_name = input(enemy_team_prompt)

    initialise()

    while True:
        draft.play_draft()
        time.sleep(1)
        draft_again = prompt_draft_again()
        if not draft_again:
            break


def initialise():
    utilities.initialise_input_dictionary(matchinfo.pairing_dictionary, "pairing_matrix.txt", True)
    utilities.initialise_input_dictionary(matchinfo.map_importance_dictionary, "map_importance_matrix.txt", False)

    if (settings.restrict_attackers):
        teampermutation.enable_restricted_attackers(settings.restricted_attackers_count)

    t0 = time.time()
    print()
    print("Initialising gamestate dictionaries (This might take a few minutes):")
    gamestatedictionaries.initialise_dictionaries(settings.read_gamestates, settings.write_gamestates)
    print("time: {}s".format(round(time.time() - t0, 2)))

    t0 = time.time()
    print()
    if settings.read_strategies:
        print("Initialising strategy dictionaries (This might take a few minutes):")
    else:
        if settings.restrict_attackers and settings.restricted_attackers_count < 4:
            print("Initialising strategy dictionaries (This might take a few minutes):")
        elif settings.restrict_attackers and settings.restricted_attackers_count < 5:
            print("Initialising strategy dictionaries (This might take an hour.):")
        else:
            long_runtime_warning = "Initialising strategy dictionaries (This might take many hours."
            + " Enable restrict_attackers with restricted_attackers_count < 5 to reduce runtime.):"
            print(long_runtime_warning)
    strategydictionaries.initialise_dictionaries(settings.read_strategies, settings.write_strategies)
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