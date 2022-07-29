import numpy as np # standard libraries
import time

import nashpy # 3rd party packages

import utilities # local source
import final

def select_defender(matrix, friends, enemies):
    size = len(friends)
    if len(enemies) != size:
        print("select_defender() failed.")
        return None

    if size == 4:
        return final.select_defender(friends, enemies)

    print("Friends: ", friends, "\n")
    print("Enemies: ", enemies, "\n")

    defender_matrix = []
    for i in range(0, size):
        f_defender = friends[i]

        remaining_friends = friends.copy()
        remaining_friends.remove(f_defender)

        row = []

        for j in range(0, size):
            e_defender = enemies[j]

            remaining_enemies = enemies.copy()
            remaining_enemies.remove(e_defender)

            select_attackers_overview = select_attackers(matrix, f_defender, remaining_friends, e_defender, remaining_enemies)
            select_attackers_value = select_attackers_overview[2]
            row.append(select_attackers_value)

        defender_matrix.append(row)

    select_defender_game = nashpy.Game(np.array(defender_matrix))
    return utilities.get_game_overview(select_defender_game)

def select_attackers(matrix, f_defender, other_friends, e_defender, other_enemies):
    size = len(other_friends)
    if len(other_enemies) != size:
        print("select_attackers() failed.")
        return None

    print("      Evaluating attackers:")

    attackers_matrix = []
    for i1 in range(0, size):
        f_attacker_A = other_friends[i1]

        for i2 in range(i1 + 1, size):
            f_attacker_B = other_friends[i2]

            remaining_friends = other_friends.copy()
            remaining_friends.remove(f_attacker_A)
            remaining_friends.remove(f_attacker_B)

            row = []

            for j1 in range(0, size):
                e_attacker_A = other_enemies[j1]

                for j2 in range(j1 + 1, size):
                    e_attacker_B = other_enemies[j2]

                    remaining_enemies = other_enemies.copy()
                    remaining_enemies.remove(e_attacker_A)
                    remaining_enemies.remove(e_attacker_B)

                    print("       - " + f_attacker_A + " & " + f_attacker_B + " and " + e_attacker_A + " & " + e_attacker_B + "...")

                    discard_attacker_overview = discard_attacker(
                        matrix, f_defender, f_attacker_A, f_attacker_B, remaining_friends, e_defender, e_attacker_A, e_attacker_B, remaining_enemies)
                    discard_attacker_value = discard_attacker_overview[2]
                    row.append(discard_attacker_value)

        attackers_matrix.append(row)

    select_attackers_game = nashpy.Game(np.array(attackers_matrix))
    return utilities.get_game_overview(select_attackers_game)

def discard_attacker(matrix, f_defender, f_attacker_A, f_attacker_B, other_friends, e_defender, e_attacker_A, e_attacker_B, other_enemies):
    AA = matrix[f_defender][e_attacker_B] + matrix[f_attacker_B][e_defender] + select_defender([f_attacker_A] + other_friends, [e_attacker_A] + other_enemies)[2]
    AB = matrix[f_defender][e_attacker_B] + matrix[f_attacker_A][e_defender] + select_defender([f_attacker_A] + other_friends, [e_attacker_B] + other_enemies)[2]
    BA = matrix[f_defender][e_attacker_A] + matrix[f_attacker_B][e_defender] + select_defender([f_attacker_B] + other_friends, [e_attacker_A] + other_enemies)[2]
    BB = matrix[f_defender][e_attacker_A] + matrix[f_attacker_A][e_defender] + select_defender([f_attacker_B] + other_friends, [e_attacker_B] + other_enemies)[2]

    discard_attacker_game = nashpy.Game(np.array([[AA, AB], [BA, BB]]))
    return utilities.get_game_overview(discard_attacker_game)