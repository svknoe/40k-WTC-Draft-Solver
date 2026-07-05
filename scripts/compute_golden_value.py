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

import drafter.solver.context as context

fixture_name = sys.argv[1] if len(sys.argv) > 1 else "Smoke"
k = int(sys.argv[2]) if len(sys.argv) > 2 else 4

config = context.SolverConfig(
    read_gamestates=False,
    write_gamestates=False,
    read_strategies=False,
    write_strategies=False,
    restrict_attackers=True,
    restricted_attackers_count=k)

import drafter.data.initialise_dictionaries as initialise_dictionaries
import drafter.common.utilities as utilities
import drafter.common.draft_stage as draft_stage_module

t0 = time.time()
ctx = initialise_dictionaries.initialise(fixture_name, config)
print("Total init time: {}s".format(round(time.time() - t0, 2)))

initial_n = 8
for candidate_n in (8, 6, 4):
    name = utilities.get_gamestate_dictionary_name(candidate_n, draft_stage_module.DraftStage.none)
    if len(ctx.gamestate_dictionaries[name]) > 0:
        initial_n = candidate_n
        break

initial_strategy_dictionary_name = utilities.get_strategy_dictionary_name(
    initial_n, draft_stage_module.DraftStage.select_defender)
initial_strategy_dictionary = ctx.strategy_dictionaries[initial_strategy_dictionary_name]
initial_strategy = utilities.get_arbitrary_dictionary_entry(initial_strategy_dictionary)

print("\nFixture: {}, k={}, n={}".format(fixture_name, k, initial_n))
print("Top-level value (repr): {!r}".format(initial_strategy[2]))
print("Friendly top-level strategy: {}".format(initial_strategy[0]))
print("Enemy top-level strategy: {}".format(initial_strategy[1]))
