"""Helper script (not a pytest module) run as a subprocess by the golden-value
tests. Solves one fixture fresh (cache read/write disabled) and prints a
single JSON line to stdout with the top-level game value and top-level
friendly/enemy strategies.

Isolation rationale: even after the B2 solver-context refactor (GitHub issue
#13) removed drafter's settings/match_info/dictionaries module globals, a few
correctness-neutral memoisation caches remain module-level (the LP normalised
cache in drafter.common.utilities). Running each solve in a fresh subprocess
(like scripts/smoke_draft.py does for the interactive draft) gives every test a
brand-new interpreter and brand-new module state, so nothing can leak between
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

ctx = initialise_dictionaries.initialise(fixture_name, config)

initial_n = None
for candidate_n in (8, 6, 4):
    name = utilities.get_gamestate_dictionary_name(candidate_n, draft_stage_module.DraftStage.none)
    if len(ctx.gamestate_dictionaries[name]) > 0:
        initial_n = candidate_n
        break

if initial_n is None:
    raise SystemError("Could not determine initial player count for fixture {}".format(fixture_name))

initial_strategy_dictionary_name = utilities.get_strategy_dictionary_name(
    initial_n, draft_stage_module.DraftStage.select_defender)
initial_strategy_dictionary = ctx.strategy_dictionaries[initial_strategy_dictionary_name]
initial_strategy = utilities.get_arbitrary_dictionary_entry(initial_strategy_dictionary)

result = {
    "n": initial_n,
    "friendly": [[ctx.friendly.name(entry[0]), entry[1]] for entry in initial_strategy[0]],
    "enemy": [[ctx.enemy.name(entry[0]), entry[1]] for entry in initial_strategy[1]],
    "value": initial_strategy[2],
}

# Isolate the JSON payload with sentinels so any incidental prints from the
# solver (progress percentages, etc.) can't be mistaken for it.
print("GOLDEN_RESULT_JSON_BEGIN")
print(json.dumps(result))
print("GOLDEN_RESULT_JSON_END")
