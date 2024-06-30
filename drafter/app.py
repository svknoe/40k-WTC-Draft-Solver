import drafter.data.set_enemy_team as set_enemy_team  # local source
import drafter.data.initialise_dictionaries as initialise_dictionaries
from drafter.data.store import Store
import drafter.solver.draft_loop as draft_loop


def run():
    # Data store used to store the state of the application
    store = Store()

    set_enemy_team.prompt_enemy_team(store)
    initialise_dictionaries.initialise()
    draft_loop.play()
    exit()


run()