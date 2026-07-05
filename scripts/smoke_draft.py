"""End-to-end smoke test: full preprocessing + one complete draft, no TTY needed.

Bypasses the InquirerPy team menu, disables JSON cache read/write so every run
computes fresh, and seeds the RNG so the draft walk is reproducible. The
in-draft prompts read stdin; an empty line accepts the suggested move.

Exits non-zero unless at least one draft ran to completion.

Usage (bash):        printf '\n\n\n\n\n\nn\n' | python scripts/smoke_draft.py
Usage (PowerShell):  "","","","","","","n" | python scripts/smoke_draft.py

The default Smoke opponent is a 4-player matrix that solves in about a second
(a 4-player draft needs 6 inputs + 1 for the draft-again prompt, as above).
Pass another folder name from drafter/resources/matches/ to smoke bigger
matrices; an 8-player draft needs 18 inputs + 1.
"""
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import drafter.solver.context as context

enemy_team_name = sys.argv[1] if len(sys.argv) > 1 else "Smoke"
config = context.SolverConfig(
    read_gamestates=False,
    write_gamestates=False,
    read_strategies=False,
    write_strategies=False)
random.seed(0)

import drafter.data.initialise_dictionaries as initialise_dictionaries
import drafter.solver.draft_loop as draft_loop

ctx = initialise_dictionaries.initialise(enemy_team_name, config)
completed_drafts = draft_loop.play(ctx)

if not completed_drafts:
    print("SMOKE TEST FAILED: no draft ran to completion")
    sys.exit(1)

print("SMOKE TEST COMPLETE")
