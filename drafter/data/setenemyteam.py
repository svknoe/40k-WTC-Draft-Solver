import os  # standard libraries
from pathlib import Path

import drafter.data.matchinfo as matchinfo  # local source


def prompt_enemy_team():
    drafter_path = Path(__file__).parent.parent
    subfolder = "resources/matches"
    matches_path = drafter_path / subfolder

    teams = [x[0] for x in os.walk(matches_path)]

    enemy_team_prompt = "Select enemy team by entering the name of a folder in ..\\drafter\\resources\\matches:"

    for team_path in teams:
        team = team_path.split('\\')[-1]
        if (team != "matches"):
            enemy_team_prompt += "\n    - " + team

    enemy_team_prompt += '\n'

    matchinfo.enemy_team_name = input(enemy_team_prompt)