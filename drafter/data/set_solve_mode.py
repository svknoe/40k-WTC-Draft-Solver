from InquirerPy import inquirer  # 3rd party packages

import drafter.solver.context as context  # local source


# The k the "fast preview" uses. The exact solve is unrestricted; the preview
# restricts each select-attackers step to the 3 heuristically best attackers per
# side (PLAN.md B5 decision, GitHub issue #16).
PREVIEW_K = 3

EXACT_CHOICE = "Exact - true equilibrium (full 8-player solve ~3 min)"
PREVIEW_CHOICE = "Fast preview - k={} heuristic (~30 s)".format(PREVIEW_K)


def config_for_mode(preview):
    """Build the SolverConfig for the chosen solve mode. Pure (no I/O) so the
    mapping can be unit-tested without a TTY; prompt_solve_mode does the I/O."""
    if preview:
        return context.SolverConfig(restrict_attackers=True, restricted_attackers_count=PREVIEW_K)
    return context.SolverConfig()  # exact (unrestricted) default


def prompt_solve_mode():
    """Ask whether to run the exact solve (default) or the fast k=3 preview,
    returning the matching SolverConfig. Mirrors set_enemy_team's InquirerPy
    startup prompt."""
    choice = inquirer.select(
        message="Solve mode:",
        choices=[EXACT_CHOICE, PREVIEW_CHOICE],
        default=EXACT_CHOICE,
    ).execute()

    return config_for_mode(preview=(choice == PREVIEW_CHOICE))
