# 40k-WTC-Draft-Solver

Creates optimal strategies for WTC pairing drafts using game theoretic Nash equilibria.

#### Disclaimer

> By default has long runtime (typically more than an hour). Change the `restricted_attackers_count` default in `SolverConfig` (`drafter/solver/context.py`) from 4 to 3 for more reasonable runtime (typically around 15 minutes).

## Input data

Each opponent gets a folder under `drafter/resources/matches/<Team>/`
containing two CSVs — the matchup ratings on each pairing's **best** and
**worst** map, from your team's perspective (11th edition: the defender picks
the map, so only those two maps ever get played):

- `pairing_matrix_best.csv`
- `pairing_matrix_worst.csv`

Both files: row 1 = your player names, row 2 = enemy player/faction names,
then one row per friendly player with their rating against each enemy column.
Ratings are **0–20 expected scores** (e.g. `15` = you expect to win 15–5 on
that map) or the legacy shorthand `--, -, 0, +, ++`. A bare `0` means an even
matchup (10–10). Best must be ≥ worst in every cell.

Folders in the old single-matrix format can be converted with
`python scripts/migrate_match_folder.py drafter/resources/matches/<Team>`.

### Where match folders live

The bundled `drafter/resources/matches/<Team>/` folders are **read-only
samples**. Put your own opponents in a per-user data directory, which is
searched first (so they survive package upgrades and work with `pipx`
installs):

- **Windows:** `%APPDATA%\wtc-draft-solver\matches\<Team>\`
- **macOS:** `~/Library/Application Support/wtc-draft-solver/matches/<Team>/`
- **Linux:** `~/.local/share/wtc-draft-solver/matches/<Team>/`

Each folder holds the two CSVs above. Solver caches are written to the platform
cache directory (e.g. `%LOCALAPPDATA%\wtc-draft-solver\Cache\matches\` on
Windows), never into the installed package.

## Local setup

### Prerequisites

- Have [Python 3.12](https://www.python.org/downloads/) installed

### Installation

You need to have a local environment and install all the needed packages.
See [Package manager](#package-manager) section for the full setup.

### Run project

In the root of the project, run.

```bash
 python -m drafter
```

Once installed (see below), the `drafter` console command runs the same
entry point:

```bash
drafter
```

## Package manager

The project uses `pyproject.toml` (setuptools backend, pinned dependencies)
to handle packages.

### Setup

To create a local environment, in the root of your project, run:

```bash
python -m venv ./.venv
```

Then, if your code editor or terminal is not in updated to the newly created environemnt, run:

```bash
source ./.venv/bin/activate # MacOS bash/zsh
source ./.venv/bin/activate.fish # MacOS fish
./.venv/Scripts/activate.bat # Windows cmd.exe
./.venv/Scripts/activate.ps1 # Windows PoerShell
```

### Install

To install the project and its dependencies (editable install, includes
`pytest` for running tests), run:

```bash
pip install -e ".[dev]"
```

This also installs the `drafter` console script, so `pipx install .` or
`uvx --from . drafter` run the bot without a manual venv/activate step.

### Updating a package

When adding/updating/deleting a dependency, edit the `dependencies` (or
`[project.optional-dependencies] dev`) list in `pyproject.toml` directly and
pin the new version with `==`.