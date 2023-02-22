import drafter.data.setenemyteam as setenemyteam  # local source
import drafter.data.initialisedictionaries as initialisedictionaries
import drafter.solver.draftloop as draftloop


def run():
    setenemyteam.prompt_enemy_team()
    initialisedictionaries.initialise()
    draftloop.play()


run()