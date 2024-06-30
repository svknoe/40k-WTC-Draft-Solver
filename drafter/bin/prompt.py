import os
from pathlib import Path
from InquirerPy import inquirer

from drafter.store import store


def prompt_enemy_team():
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