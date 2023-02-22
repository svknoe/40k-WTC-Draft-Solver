import time  # standard libraries

import drafter.data.initialisedictionaries as initialisedictionaries
import drafter.data.matchinfo as matchinfo
import drafter.solver.draft as draft


def run():
    enemy_team_prompt = "Select enemy team by entering the name of a folder in ..\\drafter\\resources\\matches:\n"
    matchinfo.enemy_team_name = input(enemy_team_prompt)

    initialisedictionaries.initialise()

    while True:
        draft.play_draft()
        time.sleep(1)
        draft_again = prompt_draft_again()
        if not draft_again:
            break


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