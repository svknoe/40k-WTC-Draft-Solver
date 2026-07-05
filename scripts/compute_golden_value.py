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

config = context.SolverConfig(restrict_attackers=True, restricted_attackers_count=k)

import drafter.data.initialise_dictionaries as initialise_dictionaries
import drafter.solver.game_state_dictionaries as game_state_dictionaries
import drafter.solver.strategy_dictionaries as strategy_dictionaries

t0 = time.time()
ctx = initialise_dictionaries.initialise(fixture_name, config)
print("Total init time: {}s".format(round(time.time() - t0, 2)))

initial_n = len(ctx.friendly.names)
root = game_state_dictionaries.get_initial_game_state(ctx)
initial_strategy = strategy_dictionaries.game_strategy(ctx, root)

print("\nFixture: {}, k={}, n={}".format(fixture_name, k, initial_n))
print("Top-level value (repr): {!r}".format(initial_strategy[2]))
print("Friendly top-level strategy: {}".format(
    [[ctx.friendly.name(entry[0]), entry[1]] for entry in initial_strategy[0]]))
print("Enemy top-level strategy: {}".format(
    [[ctx.enemy.name(entry[0]), entry[1]] for entry in initial_strategy[1]]))
