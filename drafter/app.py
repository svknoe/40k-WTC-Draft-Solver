import time  # standard libraries

import drafter.data.initialisedictionaries as initialisedictionaries
import drafter.data.matchinfo as matchinfo
import drafter.solver.draftloop as draftloop


def run():
    enemy_team_prompt = "Select enemy team by entering the name of a folder in ..\\drafter\\resources\\matches:\n"
    matchinfo.enemy_team_name = input(enemy_team_prompt)

    initialisedictionaries.initialise()
    draftloop.play()


run()