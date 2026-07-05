import drafter.data.set_enemy_team as set_enemy_team  # local source
import drafter.data.initialise_dictionaries as initialise_dictionaries
import drafter.solver.context as context
import drafter.solver.draft_loop as draft_loop


def run():
    enemy_team_name = set_enemy_team.prompt_enemy_team()
    config = context.SolverConfig()
    ctx = initialise_dictionaries.initialise(enemy_team_name, config)
    draft_loop.play(ctx)
    exit()
