from drafter.bin.prompt import prompt_enemy_team
from drafter.bin.init import init
import drafter.data.initialise_dictionaries as initialise_dictionaries
import drafter.solver.draft_loop as draft_loop


def run():
    # Get the enemy team from the user
    prompt_enemy_team()
    # Initialise the setup
    init()
    #initialise_dictionaries.initialise()
    #draft_loop.play()
    exit()


run()