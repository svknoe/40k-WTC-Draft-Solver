import os  # standard libraries
from pathlib import Path
from InquirerPy import inquirer

import drafter.data.match_info as match_info
from drafter.data.store import Store  # local source


def prompt_enemy_team(store: Store):
    source_path = Path(__file__).parent.parent
    matches_path = source_path / "resources/matches"
    teams = os.listdir(matches_path)
    if "matches" in teams: teams.remove("matches")

    store.enemy_team.name = inquirer.select(
        message="Select enemy team:",
        choices=teams,
    ).execute()
    confirm = inquirer.confirm(message="Confirm?").execute()

    if not confirm:
        prompt_enemy_team()