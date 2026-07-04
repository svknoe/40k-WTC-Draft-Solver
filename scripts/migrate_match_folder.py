"""Migrate an old-format match folder to the 11th-edition two-matrix format
(GitHub issue #10).

Old format: pairing_matrix.csv (tokens --/-/0/+/++ or raw deviation numbers)
plus optional map_importance_matrix.csv. New format: pairing_matrix_best.csv +
pairing_matrix_worst.csv on the community 0-20 score scale.

Old values are deviations from an even 10-10 game ('++' = +8 = an 18-2 game;
PLAN.md rating-scale convention, corrected 2026-07-04). At 8 players the old
model gave the defender pairing + importance and the non-defender
pairing - importance, so

    best  = clamp(10 + pairing + importance, 0, 20)
    worst = clamp(10 + pairing - importance, 0, 20)

reproduces the old defender spread exactly, saturating at the 20-0 blowout --
old pairing +/- importance can reach +/-13, and you can't lose worse than
0-20. (At 6/4 players the old model scaled importance by 0.75/0.5; the
migration uses the full-importance reading, which is the 8-player
interpretation every real folder was rated at.)

After converting, the script deletes the old-format inputs (recoverable from
git history) and any cached gamestate/strategy JSONs not stamped with the
current cache format marker -- they were solved under the old value model and
would otherwise sit around stale (see drafter/data/read_write.py).

Usage:
    python scripts/migrate_match_folder.py <folder> [<folder> ...]

where <folder> is a path like drafter/resources/matches/Germany.
"""
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import drafter.data.read_write as read_write

TOKENS = {'--': -8.0, '-': -4.0, '0': 0.0, '+': 4.0, '++': 8.0}
OLD_INPUT_FILENAMES = ["pairing_matrix.csv", "map_importance_matrix.csv", "pairing_matrix.txt"]
CACHE_GLOBS = ["gamestate_*_dictionary.json", "strategy_*_dictionary.json"]


def read_matrix(path):
    with path.open(encoding="utf-8") as f:
        rows = [row for row in csv.reader(f) if len(row) > 0]
    allies, enemies = rows[0], rows[1]
    values = [[TOKENS[cell.strip()] if cell.strip() in TOKENS else float(cell)
               for cell in row] for row in rows[2:]]
    assert len(values) == len(allies), "{}: row count != ally count".format(path)
    assert all(len(row) == len(enemies) for row in values), "{}: ragged rows".format(path)
    return allies, enemies, values


def write_matrix(path, allies, enemies, values):
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(allies)
        writer.writerow(enemies)
        for row in values:
            # A score of exactly 0 must be written '0.0': a bare '0' would be
            # re-read as the legacy even-matchup token, not the 20-0 loss.
            writer.writerow(["0.0" if value == 0 else "{:g}".format(value) for value in row])


def migrate(folder):
    folder = Path(folder)

    if (folder / "pairing_matrix_best.csv").exists():
        print("Skipping {}: already migrated (pairing_matrix_best.csv exists).".format(folder))
        return

    allies, enemies, pairing = read_matrix(folder / "pairing_matrix.csv")

    importance_path = folder / "map_importance_matrix.csv"
    if importance_path.exists():
        importance_allies, importance_enemies, importance = read_matrix(importance_path)
        assert importance_allies == allies and importance_enemies == enemies, \
            "{}: name rows differ between pairing and importance matrices".format(folder)
    else:
        print("{}: no map_importance_matrix.csv; writing best = worst = pairing.".format(folder))
        importance = [[0.0] * len(enemies) for _ in allies]

    best = [[10 + p + i for p, i in zip(pairing_row, importance_row)]
            for pairing_row, importance_row in zip(pairing, importance)]
    worst = [[10 + p - i for p, i in zip(pairing_row, importance_row)]
             for pairing_row, importance_row in zip(pairing, importance)]

    clamped_count = sum(1 for row in best + worst for value in row if not 0 <= value <= 20)
    if clamped_count > 0:
        print("{}: clamped {} cell(s) to the 0-20 scale (you can't lose worse than 0-20)".format(
            folder, clamped_count))
    best = [[min(max(value, 0), 20) for value in row] for row in best]
    worst = [[min(max(value, 0), 20) for value in row] for row in worst]

    write_matrix(folder / "pairing_matrix_best.csv", allies, enemies, best)
    write_matrix(folder / "pairing_matrix_worst.csv", allies, enemies, worst)

    for filename in OLD_INPUT_FILENAMES:
        old_file = folder / filename
        if old_file.exists():
            old_file.unlink()
            print("{}: deleted {}".format(folder, filename))

    if not read_write.cache_format_is_current(folder / read_write.CACHE_FORMAT_FILENAME):
        freed_bytes = 0
        for pattern in CACHE_GLOBS:
            for cache_file in folder.glob(pattern):
                freed_bytes += cache_file.stat().st_size
                cache_file.unlink()
        if freed_bytes > 0:
            print("{}: deleted stale old-model caches ({:.1f} MB freed)".format(
                folder, freed_bytes / 1e6))

    print("Migrated {}".format(folder))


if len(sys.argv) < 2:
    sys.exit(__doc__)

for folder_argument in sys.argv[1:]:
    migrate(folder_argument)
