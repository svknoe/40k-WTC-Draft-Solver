import time # standard libraries
import itertools
import math
import sys

import utilities # local source
import initial
import final

def generate_strategy_dictionaries(match):
	matrix = utilities.import_pairing_matrix(match)

	four_player_discard_attacker_strategies = get_n_player_discard_attacker_dictionary(matrix, 4)
	#utilities.write_strategy_with_print_calls(match, four_player_discard_attacker_strategies, "four_player_discard_attacker_dictionary.json")
	#print("cache size: ", len(final.discard_attacker_cache))

	four_player_select_attackers_strategies = get_n_player_select_attackers_dictionary(matrix, 4, four_player_discard_attacker_strategies)
	#utilities.write_strategy_with_print_calls(match, four_player_select_attackers_strategies, "four_player_select_attackers_dictionary.json")
	#print("cache size: ", len(final.select_attackers_cache)) 


def get_n_player_discard_attacker_dictionary(matrix, n):
	# Format: [defender, attackerA, attackerB, ...]
	def get_discard_attacker_player_permutations(players, n):
		player_combinations = itertools.combinations(players, n)
		player_permutations = []
		for combination in player_combinations:
			combination_permutations = []

			for defender in combination:
				non_defenders = list(combination).copy()
				non_defenders.remove(defender)

				for i in range(0, len(non_defenders) - 1):
					attacker_A = non_defenders[i]

					for j in range(i + 1, len(non_defenders)):
						attacker_B = non_defenders[j]

						remaining_players = non_defenders.copy()
						remaining_players.remove(attacker_A)
						remaining_players.remove(attacker_B)

						permutation = [defender, attacker_A, attacker_B]
						permutation.extend(remaining_players)
						combination_permutations.append(permutation)

						if "Michal Gemmeke" in combination:
							if (list(combination) == ["Michal Gemmeke", "Matthias Bellmann", "Martin Nguyen", "Immanuel Wolf"]):
								print("FOO")


			player_permutations.extend(combination_permutations)
		
		return player_permutations

	if (not (n == 4 or n == 6 or n == 8)):
		sys.exit("{} is not a valid number of players for discarding attacker. Choose 4, 6 or 8.".format(n))

	friends = [friend for friend in matrix]
	enemies = [enemy for enemy in matrix[friends[0]]]
	
	friend_permutations = get_discard_attacker_player_permutations(friends, n)
	enemy_permutations = get_discard_attacker_player_permutations(enemies, n)

	if ["Michal Gemmeke", "Matthias Bellmann", "Martin Nguyen", "Immanuel Wolf"] in enemy_permutations:
		print("bar") # TODO WORKING HERE!

	product = itertools.product(friend_permutations, enemy_permutations)
	game_permutations = [[list(element[0]), list(element[1])] for element in product]

	enemy_permutations = [game_permutation[1] for game_permutation in game_permutations]

	foo = ["Michal Gemmeke", "Matthias Bellmann", "Martin Nguyen", "Immanuel Wolf"] in enemy_permutations
	print(foo)
	print(enemy_permutations[0])

	kake = 0




	if foo:
		print()

	if foo:
		print()

	kake = 0
	kake = 0

	if foo:
		print("ya")

	kake = 0
	kake = 0
	kake = 0
	kake = 0


	print("Generating {}-players discard attacker strategies:".format(n))
	counter = 0
	percentage = -1
	n_player_discard_attacker_strategies = {}
	for game_permutation in game_permutations:
		counter += 1
		new_percentage = math.floor(10 * counter / len(game_permutations))
		if (new_percentage > percentage):
			percentage = new_percentage
			print(" - {}%: ".format(10 * percentage), counter, "/", len(list(game_permutations)))
		
		permutation_key = utilities.get_permutation_key(n, game_permutation)

		remaining_friends = game_permutation[0].copy()
		f_defender = remaining_friends.pop(0)
		f_attacker_A = remaining_friends.pop(0)
		f_attacker_B = remaining_friends.pop(0)

		remaining_enemies = game_permutation[1].copy()
		e_defender = remaining_enemies.pop(0)
		e_attacker_A = remaining_enemies.pop(0)
		e_attacker_B = remaining_enemies.pop(0)

		if (f_defender == "Patrick" and f_attacker_A == "Bjørn" and f_attacker_B == "Magnus" and remaining_friends[0] == "Rasmus" 
			and e_defender == "Michal Gemmeke" and e_attacker_A == "Immanuel Wolf" and e_attacker_B == "Matthias Bellmann" and remaining_enemies[0] == "Martin Nguyen"):
			print("TADA")

		if (n == 4):
			strategy = final.discard_attacker(matrix, f_defender, f_attacker_A, f_attacker_B, remaining_friends[0], e_defender, e_attacker_A, e_attacker_B, remaining_enemies[0])
		else:
			strategy = initial.discard_attacker(matrix, f_defender, f_attacker_A, f_attacker_B, remaining_friends, e_defender, e_attacker_A, e_attacker_B, remaining_enemies)

		n_player_discard_attacker_strategies[permutation_key] = [list(strategy[0]), list(strategy[1]), strategy[2]]

	return n_player_discard_attacker_strategies



def get_n_player_select_attackers_dictionary(matrix, n, discard_attacker_strategies):
	if (not (n == 4 or n == 6 or n == 8)):
		sys.exit("{} is not a valid number of players for selecting attackers. Choose 4, 6 or 8.".format(n))

	# Format: [defender, ...]
	def get_select_attackers_player_permutations(players, n):
		player_combinations = itertools.combinations(players, n)
		player_permutations = []
		for combination in player_combinations:
			combination_permutations = []

			for defender in combination:
				non_defenders = list(combination).copy()
				non_defenders.remove(defender)

				permutation = [defender]
				permutation.extend(non_defenders)
				combination_permutations.append(permutation)

			player_permutations.extend(combination_permutations)
		
		return player_permutations
	
	friends = [friend for friend in matrix]
	enemies = [enemy for enemy in matrix[friends[0]]]
	
	friend_permutations = get_select_attackers_player_permutations(friends, n)
	enemy_permutations = get_select_attackers_player_permutations(enemies, n)

	product = itertools.product(friend_permutations, enemy_permutations)
	game_permutations = [[list(element[0]), list(element[1])] for element in product]

	print("Generating {}-players select attackers strategies:".format(n))
	counter = 0
	percentage = -1
	n_player_select_attackers_strategies = {}
	for game_permutation in game_permutations:
		counter += 1
		new_percentage = math.floor(10 * counter / len(game_permutations))
		if (new_percentage > percentage):
			percentage = new_percentage
			print(" - {}%: ".format(10 * percentage), counter, "/", len(list(game_permutations)))
		
		permutation_key = utilities.get_permutation_key(n, game_permutation)

		remaining_friends = game_permutation[0].copy()
		f_defender = remaining_friends.pop(0)

		remaining_enemies = game_permutation[1].copy()
		e_defender = remaining_enemies.pop(0)

		print(len(discard_attacker_strategies))

		if (n == 4):
			strategy = final.select_attackers(discard_attacker_strategies, f_defender, remaining_friends, e_defender, remaining_enemies)
		else:
			strategy = initial.select_attackers(discard_attacker_strategies, f_defender, remaining_friends, e_defender, remaining_enemies)

		n_player_select_attackers_strategies[permutation_key] = [list(strategy[0]), list(strategy[1]), strategy[2]]

	return n_player_select_attackers_strategies


def get_n_player_select_defender_dictionary(matrix, subfolder, n):
	if (not (n == 4 or n == 6 or n == 8)):
		sys.exit("{} is not a valid number of players for selecting defender. Choose 4, 6 or 8.".format(n))

	friends = [friend for friend in matrix]
	enemies = [enemy for enemy in matrix[friends[0]]]

	friend_combinations = itertools.combinations(friends, n)
	enemy_combinations = itertools.combinations(enemies, n)
	product = itertools.product(friend_combinations, enemy_combinations)
	permutations = [[list(element[0]), list(element[1])] for element in product]

	counter = 0
	n_player_select_defender_strategies = {}
	for permutation in permutations:
		counter += 1
		print(counter, "/", len(list(permutations)))
		
		permutation_key = ""
		for i in range(0,n): # Add friends to key.
			permutation_key += permutation[0][i]
		for i in range(0,n): # Add enemies to key.
			permutation_key += permutation[1][i]

		if (n == 4):
			strategy = final.select_defender(matrix, permutation[0], permutation[1])
		else:
			strategy = initial.select_defender(permutation[0], permutation[1])

		n_player_select_defender_strategies[permutation_key] = [list(strategy[0]), list(strategy[1]), strategy[2]]

	return n_player_select_defender_strategies





	
t0 = time.time()

generate_strategy_dictionaries("Germany")

print(time.time() - t0)