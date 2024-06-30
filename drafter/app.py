import drafter.data.set_enemy_team as set_enemy_team  # local source
import drafter.data.initialise_dictionaries as initialise_dictionaries
import drafter.solver.draft_loop as draft_loop


def run():
    set_enemy_team.prompt_enemy_team()
    initialise_dictionaries.initialise()
    draft_loop.play()
    exit()


run()