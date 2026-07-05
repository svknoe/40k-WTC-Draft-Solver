from InquirerPy import inquirer  # 3rd party packages

import drafter.data.paths as paths  # local source


def prompt_enemy_team():
    teams = paths.list_available_teams()

    enemy_team_name = inquirer.select(
        message="Select enemy team:",
        choices=teams,
    ).execute()
    confirm = inquirer.confirm(message="Confirm?").execute()

    if not confirm:
        return prompt_enemy_team()

    return enemy_team_name
