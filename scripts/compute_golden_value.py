"""Compute the top-level game value (and top-level strategies) for a fixture,
with cache reads/writes disabled, so the value can be hard-coded as a golden
test expectation. Not part of the test suite itself -- a one-off tool used to
derive the numbers baked into drafter/tests/test_golden_values.py.

Usage (PowerShell):
    .venv\\Scripts\\python.exe scripts\\compute_golden_value.py <FixtureName> <k>

Example:
    .venv\\Scripts\\python.exe scripts\\compute_golden_value.py Scotland 3
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import drafter.data.match_info as match_info
import drafter.data.settings as settings

fixture_name = sys.argv[1] if len(sys.argv) > 1 else "Smoke"
k = int(sys.argv[2]) if len(sys.argv) > 2 else 4

match_info.enemy_team_name = fixture_name
settings.read_gamestates = False
settings.write_gamestates = False
settings.read_strategies = False
settings.write_strategies = False
settings.restrict_attackers = True
settings.restricted_attackers_count = k

import drafter.data.initialise_dictionaries as initialise_dictionaries
import drafter.common.utilities as utilities
import drafter.solver.strategy_dictionaries as strategy_dictionaries
import drafter.common.draft_stage as draft_stage_module

t0 = time.time()
initialise_dictionaries.initialise()
print("Total init time: {}s".format(round(time.time() - t0, 2)))

initial_n = 8
for candidate_n in (8, 6, 4):
    name = utilities.get_gamestate_dictionary_name(candidate_n, draft_stage_module.DraftStage.none)
    import drafter.solver.game_state_dictionaries as game_state_dictionaries
    if len(game_state_dictionaries.dictionaries[name]) > 0:
        initial_n = candidate_n
        break

initial_strategy_dictionary_name = utilities.get_strategy_dictionary_name(
    initial_n, draft_stage_module.DraftStage.select_defender)
initial_strategy_dictionary = strategy_dictionaries.dictionaries[initial_strategy_dictionary_name]
initial_strategy = utilities.get_arbitrary_dictionary_entry(initial_strategy_dictionary)

print("\nFixture: {}, k={}, n={}".format(fixture_name, k, initial_n))
print("Top-level value (repr): {!r}".format(initial_strategy[2]))
print("Friendly top-level strategy: {}".format(initial_strategy[0]))
print("Enemy top-level strategy: {}".format(initial_strategy[1]))
