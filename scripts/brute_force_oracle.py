"""Independent brute-force oracle for 4- and 6-player match folders.

Shares NO solver code with the drafter package: reads the two CSVs directly,
enumerates the draft explicitly, and solves every zero-sum stage game with
scipy's linear-programming solver (drafter uses nashpy enumeration instead).
Used to cross-check golden values whenever the value model or the solver
changes (issues #9, #30, #32).

Model (11th edition, PLAN.md workstream C):
  - defender picks the map: friendly defender -> best-map value, enemy
    defender -> worst-map value, no defender -> midpoint of best and worst
    (settings.neutral_map_weight default 0.5 is hard-coded here)
  - ratings normalised as internal = score - 10 (deviation scale), tokens
    --/-/0/+/++ = -8/-4/0/+4/+8
  - draft: both teams simultaneously pick a defender, then two attackers
    from their remainder against the enemy defender, then each refuses one
    of the two attackers presented; the kept attacker plays the defender and
    the REFUSED attackers return to the pools for the next round (the child
    wiring issue #32 fixed in the engine). At 4 players the endgame is
    closed: refused vs refused and last vs last play each other.

The oracle is exhaustive (no k-restriction), so compare it against the
engine with settings.restrict_attackers = False. 8-player folders are
rejected: the unrestricted 8-player tree costs hours here; the 6-player
oracle already exercises every code path the 4-player one cannot (in
particular the recursive discard-stage child wiring).

Usage:
    python scripts/brute_force_oracle.py [<folder>]     # default Smoke

Prints the top-level game value and one optimal friendly defender mix.
"""
import csv
import itertools
import sys
from pathlib import Path

import numpy as np
from scipy.optimize import linprog

FOLDER = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(
    "drafter/resources/matches/Smoke")

TOKENS = {'--': -8.0, '-': -4.0, '0': 0.0, '+': 4.0, '++': 8.0}
NEUTRAL_MAP_WEIGHT = 0.5


def read_matrix(name):
    with (FOLDER / name).open(encoding="utf-8-sig") as f:
        rows = [row for row in csv.reader(f) if row]
    friends, enemies = rows[0], rows[1]
    values = {}
    for friend, row in zip(friends, rows[2:]):
        for enemy, cell in zip(enemies, row):
            cell = cell.strip()
            values[(friend, enemy)] = TOKENS[cell] if cell in TOKENS else float(cell) - 10
    return friends, enemies, values


FRIENDS, ENEMIES, BEST = read_matrix("pairing_matrix_best.csv")
_, _, WORST = read_matrix("pairing_matrix_worst.csv")


def value(friend, enemy, defender=None):
    if defender == friend:
        return BEST[(friend, enemy)]
    if defender == enemy:
        return WORST[(friend, enemy)]
    assert defender is None
    best, worst = BEST[(friend, enemy)], WORST[(friend, enemy)]
    return worst + NEUTRAL_MAP_WEIGHT * (best - worst)


def solve_zero_sum(matrix):
    """Value + row strategy of the zero-sum game (row maximises), by LP."""
    a = np.asarray(matrix, dtype=float)
    shift = a.min()
    a = a - shift + 1  # make strictly positive so the standard LP trick works
    rows, cols = a.shape
    # min sum(x) s.t. A^T x >= 1, x >= 0 ; game value = 1/sum(x)
    res = linprog(c=np.ones(rows), A_ub=-a.T, b_ub=-np.ones(cols),
                  bounds=[(0, None)] * rows, method="highs")
    assert res.success, res.message
    v = 1 / res.x.sum()
    return v + shift - 1, res.x * v


def endgame_discard_value(f_def, f_att, e_def, e_att, f_last, e_last):
    """4-player discard: closed endgame. Rows = which enemy attacker the
    friendly side refuses, columns = which friendly attacker the enemy side
    refuses; refused vs refused and last vs last play each other."""
    fixed = value(f_last, e_last)
    m = np.zeros((2, 2))
    for i, e_refused in enumerate(e_att):
        e_kept = e_att[1 - i]
        for j, f_refused in enumerate(f_att):
            f_kept = f_att[1 - j]
            m[i, j] = (value(f_def, e_kept, defender=f_def)
                       + value(f_kept, e_def, defender=e_def)
                       + value(f_refused, e_refused)
                       + fixed)
    v, _ = solve_zero_sum(m)
    return v


def recursive_discard_value(f_def, f_att, f_rem, e_def, e_att, e_rem):
    """6-player discard: the two fixed pairings plus the value of the next
    round, where the REFUSED attackers rejoin the remaining players."""
    m = np.zeros((2, 2))
    for i, e_refused in enumerate(e_att):
        e_kept = e_att[1 - i]
        for j, f_refused in enumerate(f_att):
            f_kept = f_att[1 - j]
            m[i, j] = (value(f_def, e_kept, defender=f_def)
                       + value(f_kept, e_def, defender=e_def)
                       + none_stage_value(tuple(sorted(f_rem + [f_refused])),
                                          tuple(sorted(e_rem + [e_refused]))))
    v, _ = solve_zero_sum(m)
    return v


def attackers_stage_value(f_def, f_rest, e_def, e_rest):
    f_options = list(itertools.combinations(f_rest, 2))
    e_options = list(itertools.combinations(e_rest, 2))
    m = np.zeros((len(f_options), len(e_options)))
    for i, f_att in enumerate(f_options):
        f_rem = [p for p in f_rest if p not in f_att]
        for j, e_att in enumerate(e_options):
            e_rem = [p for p in e_rest if p not in e_att]
            if len(f_rest) == 3:
                m[i, j] = endgame_discard_value(
                    f_def, list(f_att), e_def, list(e_att), f_rem[0], e_rem[0])
            else:
                m[i, j] = recursive_discard_value(
                    f_def, list(f_att), f_rem, e_def, list(e_att), e_rem)
    v, _ = solve_zero_sum(m)
    return v


_none_stage_cache = {}


def none_stage_value(f_players, e_players):
    """Value of a fresh n-player round (both defenders still to pick),
    memoised on the two player sets."""
    key = (f_players, e_players)
    if key not in _none_stage_cache:
        m, _, _ = defender_stage_matrix(f_players, e_players)
        _none_stage_cache[key], _ = solve_zero_sum(m)
    return _none_stage_cache[key]


def defender_stage_matrix(f_players, e_players):
    m = np.zeros((len(f_players), len(e_players)))
    for i, f_def in enumerate(f_players):
        f_rest = [p for p in f_players if p != f_def]
        for j, e_def in enumerate(e_players):
            e_rest = [p for p in e_players if p != e_def]
            m[i, j] = attackers_stage_value(f_def, f_rest, e_def, e_rest)
    return m, f_players, e_players


def main():
    if len(FRIENDS) not in (4, 6):
        sys.exit("Oracle supports 4- and 6-player folders; {} has {} players "
                 "(an unrestricted 8-player tree is impractical here).".format(FOLDER, len(FRIENDS)))

    m, _, _ = defender_stage_matrix(tuple(FRIENDS), tuple(ENEMIES))
    v, strategy = solve_zero_sum(m)

    print("Folder: {} ({} players, unrestricted)".format(FOLDER, len(FRIENDS)))
    print("Friendly defender strategy (one optimum):",
          {f: round(p, 3) for f, p in zip(FRIENDS, strategy)})
    print("Top-level game value (repr): {!r}".format(v))


main()
