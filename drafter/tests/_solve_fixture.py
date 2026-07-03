"""Helper script (not a pytest module) run as a subprocess by the golden-value
tests. Solves one fixture fresh (cache read/write disabled) and prints a
single JSON line to stdout with the top-level game value and top-level
friendly/enemy strategies.

Isolation rationale: drafter's settings/match_info/dictionaries modules are
mutated module-level globals (see CLAUDE.md), and drafter.common.team_permutation
additionally caches a restrict_attackers_k plus regular/transposed pairing
dictionaries at import time via enable_restricted_attackers(). None of this
resets cleanly between fixtures in one process. Running each solve in a fresh
subprocess (like scripts/smoke_draft.py does for the interactive draft) sidesteps
all of that: every test gets a brand-new interpreter and brand-new module state.

Usage:
    python _solve_fixture.py <fixture_name> <k>

Prints one line of JSON to stdout:
    {"n": 8, "value": 6.189614..., "friendly": [[name, prob], ...], "enemy": [...]}
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

import drafter.data.match_info as match_info
import drafter.data.settings as settings

fixture_name = sys.argv[1]
k = int(sys.argv[2])

match_info.enemy_team_name = fixture_name
settings.read_gamestates = False
settings.write_gamestates = False
settings.read_strategies = False
settings.write_strategies = False
settings.restrict_attackers = True
settings.restricted_attackers_count = k

import drafter.data.initialise_dictionaries as initialise_dictionaries
import drafter.common.utilities as utilities
import drafter.common.draft_stage as draft_stage_module
import drafter.solver.game_state_dictionaries as game_state_dictionaries
import drafter.solver.strategy_dictionaries as strategy_dictionaries

initialise_dictionaries.initialise()

initial_n = None
for candidate_n in (8, 6, 4):
    name = utilities.get_gamestate_dictionary_name(candidate_n, draft_stage_module.DraftStage.none)
    if len(game_state_dictionaries.dictionaries[name]) > 0:
        initial_n = candidate_n
        break

if initial_n is None:
    raise SystemError("Could not determine initial player count for fixture {}".format(fixture_name))

initial_strategy_dictionary_name = utilities.get_strategy_dictionary_name(
    initial_n, draft_stage_module.DraftStage.select_defender)
initial_strategy_dictionary = strategy_dictionaries.dictionaries[initial_strategy_dictionary_name]
initial_strategy = utilities.get_arbitrary_dictionary_entry(initial_strategy_dictionary)

result = {
    "n": initial_n,
    "friendly": [[entry[0], entry[1]] for entry in initial_strategy[0]],
    "enemy": [[entry[0], entry[1]] for entry in initial_strategy[1]],
    "value": initial_strategy[2],
}

# Isolate the JSON payload with sentinels so any incidental prints from the
# solver (progress percentages, nashpy warnings routed to stdout, etc.) can't
# be mistaken for it.
print("GOLDEN_RESULT_JSON_BEGIN")
print(json.dumps(result))
print("GOLDEN_RESULT_JSON_END")
