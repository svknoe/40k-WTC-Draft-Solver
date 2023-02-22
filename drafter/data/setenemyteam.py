import drafter.data.matchinfo as matchinfo

def prompt_enemy_team():
    enemy_team_prompt = "Select enemy team by entering the name of a folder in ..\\drafter\\resources\\matches:\n"
    matchinfo.enemy_team_name = input(enemy_team_prompt)