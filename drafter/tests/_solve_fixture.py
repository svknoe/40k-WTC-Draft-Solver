"""Helper script (not a pytest module) run as a subprocess by the golden-value
tests. Solves one fixture fresh and prints a single JSON line to stdout with the
top-level game value and top-level friendly/enemy strategies.

Isolation rationale: a couple of correctness-neutral memoisation caches are
module-level (the LP normalised cache in drafter.common.utilities). Running each
solve in a fresh subprocess (like scripts/smoke_draft.py does for the interactive
draft) gives every test a brand-new interpreter, so nothing leaks between
fixtures.

Usage:
    python _solve_fixture.py <fixture_name> <k>

Prints one line of JSON to stdout:
    {"n": 8, "value": 5.875946..., "friendly": [[name, prob], ...], "enemy": [...]}
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

import drafter.solver.context as context

fixture_name = sys.argv[1]
k = int(sys.argv[2])

config = context.SolverConfig(restrict_attackers=True, restricted_attackers_count=k)

import drafter.data.initialise_dictionaries as initialise_dictionaries
import drafter.solver.game_state_dictionaries as game_state_dictionaries
import drafter.solver.strategy_dictionaries as strategy_dictionaries

ctx = initialise_dictionaries.initialise(fixture_name, config)

# The top-level strategy is the select_defender game at the initial (full-team)
# gamestate, recomputed from the solved values (GitHub issue #13, B3).
initial_n = len(ctx.friendly.names)
root = game_state_dictionaries.get_initial_game_state(ctx)
strategy = strategy_dictionaries.game_strategy(ctx, root)

result = {
    "n": initial_n,
    "friendly": [[ctx.friendly.name(entry[0]), entry[1]] for entry in strategy[0]],
    "enemy": [[ctx.enemy.name(entry[0]), entry[1]] for entry in strategy[1]],
    "value": strategy[2],
}

# Isolate the JSON payload with sentinels so any incidental prints from the
# solver (progress percentages, etc.) can't be mistaken for it.
print("GOLDEN_RESULT_JSON_BEGIN")
print(json.dumps(result))
print("GOLDEN_RESULT_JSON_END")
