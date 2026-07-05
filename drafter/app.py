import drafter.data.set_enemy_team as set_enemy_team  # local source
import drafter.data.set_solve_mode as set_solve_mode
import drafter.data.initialise_dictionaries as initialise_dictionaries
import drafter.solver.draft_loop as draft_loop


def run():
    enemy_team_name = set_enemy_team.prompt_enemy_team()
    config = set_solve_mode.prompt_solve_mode()
    ctx = initialise_dictionaries.initialise(enemy_team_name, config)
    draft_loop.play(ctx)
    exit()
