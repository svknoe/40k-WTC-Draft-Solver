import numpy as np # standard libraries
import time

import nashpy # 3rd party packages

import utilities # local source

def select_defender(matrix, friends, enemies):
	size = len(friends)
	if len(enemies) != size:
		print("select_defender() failed.")
		return None

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

select_attackers_cache = {}

def select_attackers(discard_attacker_strategies, f_defender, remaining_friends, e_defender, remaining_enemies):
	size = len(remaining_friends)
	if len(remaining_enemies) != size:
		print("select_attackers() failed.")
		return None

	attackers_matrix = []
	for i in range(0, size):
		f_not_selected = remaining_friends[i]
		f_attacker_A = remaining_friends[(i + 1) % size]
		f_attacker_B = remaining_friends[(i + 2) % size]

		row = []

		for j in range(0, size):
			e_not_selected = remaining_enemies[j]
			e_attacker_A = remaining_enemies[(j + 1) % size]
			e_attacker_B = remaining_enemies[(j + 2) % size]

			game_permutation = [[f_defender, f_attacker_A, f_attacker_B, f_not_selected],[e_defender, e_attacker_A, e_attacker_B, e_not_selected]]
			permutation_key = utilities.get_permutation_key(game_permutation, 4)


			print(game_permutation)
			print(permutation_key)
			print(permutation_key in discard_attacker_strategies)
			
			discard_attacker_overview = discard_attacker_strategies[permutation_key]
			discard_attacker_value = discard_attacker_overview[2]
			row.append(discard_attacker_value)


			print(discard_attacker_overview)
			time.sleep(5)

		attackers_matrix.append(row)

	game_array = np.array(attackers_matrix)
	print(game_array)
	return utilities.evaluate_game(select_attackers_cache, game_array)

discard_attacker_cache = {}

def discard_attacker(matrix, f_defender, f_attacker_A, f_attacker_B, f_not_selected, e_defender, e_attacker_A, e_attacker_B, e_not_selected):
	AA = matrix[f_defender][e_attacker_B] + matrix[f_attacker_B][e_defender] + matrix[f_attacker_A][e_attacker_A] + matrix[f_not_selected][e_not_selected]
	AB = matrix[f_defender][e_attacker_B] + matrix[f_attacker_A][e_defender] + matrix[f_attacker_B][e_attacker_A] + matrix[f_not_selected][e_not_selected]
	BA = matrix[f_defender][e_attacker_A] + matrix[f_attacker_B][e_defender] + matrix[f_attacker_A][e_attacker_B] + matrix[f_not_selected][e_not_selected]
	BB = matrix[f_defender][e_attacker_A] + matrix[f_attacker_A][e_defender] + matrix[f_attacker_B][e_attacker_B] + matrix[f_not_selected][e_not_selected]

	game_array = np.array([[AA, AB], [BA, BB]])
	return utilities.evaluate_game(discard_attacker_cache, game_array)