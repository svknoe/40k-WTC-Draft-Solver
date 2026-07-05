"""Export conformance fixtures for the TypeScript engine (GitHub issue #17).

For each packaged fixture team and solve mode, solve the draft tree with the
Python engine (the current source of truth) and write a JSON fixture the TS
engine's conformance suite (web/src/conformance) asserts against:

- the input matrix on the internal scale (so CSV parsing stays out of scope),
- per-(n, stage) gamestate counts (pins the enumeration, including the
  k-restriction heuristic's eligible-attacker choices),
- the root game value + full-precision root strategies,
- sample nodes along a deterministic argmax walk of the draft tree, each with
  its payoff matrix, option labels, value and full-precision strategies.

Values are unique per zero-sum game, so the TS engine must reproduce them to
~1e-9. Mixed strategies are NOT always unique (degenerate games have many
equilibria), so the TS suite asserts strategies as epsilon-equilibria of the
shared payoff matrix rather than by direct comparison; the exported strategies
document what the Python LP happened to return.

Usage (PowerShell, from the repo root):
    .venv\\Scripts\\python.exe scripts\\export_conformance_fixtures.py

Writes web/src/conformance/fixtures/<team>.json. Scotland exact takes ~3 min;
the whole export is a one-off (re-run only when the value model changes).
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import drafter.common.utilities as utilities
import drafter.data.initialise_dictionaries as initialise_dictionaries
import drafter.solver.context as context
import drafter.solver.games as games
import drafter.solver.game_state_dictionaries as game_state_dictionaries
import drafter.solver.strategy_dictionaries as strategy_dictionaries
from drafter.common.draft_stage import DraftStage
from drafter.common.game_state import GameState
from drafter.common.team_permutation import TeamPermutation

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "web" / "src" / "conformance" / "fixtures"

# (team, [k or None for exact]) -- every packaged sample the TS suite pins.
EXPORTS = [
    ("Smoke", [None]),
    ("Six", [None, 4]),
    ("Scotland", [3, 4, None]),
]

STAGE_NAMES = {
    DraftStage.none: "none",
    DraftStage.select_defender: "select_defender",
    DraftStage.select_attackers: "select_attackers",
}


def describe_team(team_permutation):
    return {
        "remaining": list(team_permutation.remaining_players),
        "defender": team_permutation.defender,
        "attackerA": team_permutation.attacker_A,
        "attackerB": team_permutation.attacker_B,
    }


def export_node(ctx, gamestate):
    """One sample node: payoff matrix + labels + full-precision solution."""
    game_array, friendly_options, enemy_options = games.build_game(
        ctx, gamestate, strategy_dictionaries._child_value_getter(ctx))
    row_strategy, column_strategy, value = utilities.get_game_solution(game_array)

    node = {
        "stage": STAGE_NAMES[gamestate.draft_stage],
        "state": {
            "friendly": describe_team(gamestate.friendly_team_permutation),
            "enemy": describe_team(gamestate.enemy_team_permutation),
        },
        "rowLabels": friendly_options,
        "colLabels": enemy_options,
        "payoff": [list(row) for row in game_array.tolist()],
        "value": value,
        "rowStrategy": list(row_strategy),
        "colStrategy": list(column_strategy),
    }
    return node, (friendly_options, enemy_options, row_strategy, column_strategy)


def first_argmax(values):
    return list(values).index(max(values))


def argmax_walk(ctx):
    """Walk the draft tree, both sides always playing the first argmax option of
    the equilibrium mix, exporting every visited node down to the 4-player
    discard game. Deterministic given the Python engine's solution."""
    nodes = []
    gamestate = game_state_dictionaries.get_initial_game_state(ctx)

    while True:
        node, (friendly_options, enemy_options, row_strategy, column_strategy) = \
            export_node(ctx, gamestate)
        nodes.append(node)

        i = first_argmax(row_strategy)
        j = first_argmax(column_strategy)
        friendly = gamestate.friendly_team_permutation
        enemy = gamestate.enemy_team_permutation

        if gamestate.draft_stage == DraftStage.none:
            gamestate = GameState(
                DraftStage.select_defender,
                TeamPermutation([p for p in friendly.remaining_players if p != friendly_options[i]],
                                friendly_options[i]),
                TeamPermutation([p for p in enemy.remaining_players if p != enemy_options[j]],
                                enemy_options[j]))
        elif gamestate.draft_stage == DraftStage.select_defender:
            f_pair, e_pair = friendly_options[i], enemy_options[j]
            gamestate = GameState(
                DraftStage.select_attackers,
                TeamPermutation([p for p in friendly.remaining_players if p not in f_pair],
                                friendly.defender, f_pair[0], f_pair[1]),
                TeamPermutation([p for p in enemy.remaining_players if p not in e_pair],
                                enemy.defender, e_pair[0], e_pair[1]))
        elif gamestate.draft_stage == DraftStage.select_attackers:
            if gamestate.get_n() == 4:
                break
            # Discard game: row label = the refused ENEMY attacker, column label
            # = the refused FRIENDLY attacker (see games.build_discard_game);
            # both refused players return to their pools for the next round.
            refused_enemy = friendly_options[i]
            refused_friendly = enemy_options[j]
            gamestate = GameState(
                DraftStage.none,
                TeamPermutation(friendly.remaining_players + [refused_friendly]),
                TeamPermutation(enemy.remaining_players + [refused_enemy]))
        else:
            raise ValueError("Unexpected stage in walk: {}".format(gamestate.draft_stage))

    return nodes


def export_solve(team_name, k):
    config = context.SolverConfig(
        restrict_attackers=(k is not None),
        restricted_attackers_count=(k if k is not None else 3))

    t0 = time.time()
    ctx = initialise_dictionaries.initialise(team_name, config)
    elapsed = round(time.time() - t0, 2)

    stage_counts = {
        "{}:{}".format(n, STAGE_NAMES[stage]): int(len(keys))
        for (n, stage), keys in ctx.gamestate_key_arrays.items()
    }

    nodes = argmax_walk(ctx)

    return ctx, {
        "k": k,
        "stageCounts": stage_counts,
        "expectedValue": nodes[0]["value"],
        "sampleNodes": nodes,
        "pythonSolveSeconds": elapsed,
    }


def export_team(team_name, ks):
    solves = []
    ctx = None
    for k in ks:
        ctx, solve = export_solve(team_name, k)
        solves.append(solve)
        print("  {} k={}: value={!r} ({}s)".format(
            team_name, k, solve["expectedValue"], solve["pythonSolveSeconds"]))

    fixture = {
        "team": team_name,
        "generatedBy": "scripts/export_conformance_fixtures.py (Python engine, issue #17)",
        "n": len(ctx.friendly.names),
        "myNames": list(ctx.friendly.names),
        "enemyNames": list(ctx.enemy.names),
        "cellsBest": [list(row) for row in ctx.pairing.best.tolist()],
        "cellsWorst": [list(row) for row in ctx.pairing.worst.tolist()],
        "neutralWeight": ctx.pairing.neutral_weight,
        "solves": solves,
    }

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / "{}.json".format(team_name.lower())
    with output_path.open("w", encoding="utf-8") as file:
        json.dump(fixture, file, indent=1)
        file.write("\n")
    print("  wrote {}".format(output_path))


if __name__ == "__main__":
    for team_name, ks in EXPORTS:
        print("Exporting {}...".format(team_name))
        export_team(team_name, ks)
