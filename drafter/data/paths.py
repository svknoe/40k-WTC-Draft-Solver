"""Match-folder and cache path resolution (GitHub issue #26).

A pip/pipx-installed user can't edit match folders inside site-packages (they're
undiscoverable and wiped on upgrade), and solver caches shouldn't be written
there either. So match inputs resolve from a per-user data directory searched
BEFORE the packaged samples, and caches go to the platform cache directory. The
packaged folders under drafter/resources/matches stay read-only samples.
"""
import os
from dataclasses import dataclass
from pathlib import Path

import platformdirs

APP_NAME = "wtc-draft-solver"


def packaged_matches_dir():
    # Bundled read-only sample match folders shipped inside the package.
    return Path(__file__).resolve().parent.parent / "resources" / "matches"


def user_matches_dir():
    # Per-user match folders (%APPDATA%\wtc-draft-solver\matches on Windows),
    # searched before the packaged samples so installed users can add their own.
    return Path(platformdirs.user_data_dir(APP_NAME, appauthor=False, roaming=True)) / "matches"


def user_cache_root():
    # Solver JSON caches go to the platform cache dir, never into site-packages.
    return Path(platformdirs.user_cache_dir(APP_NAME, appauthor=False)) / "matches"


@dataclass(frozen=True)
class MatchPaths:
    input_dir: Path       # where this match's CSVs are read from
    cache_dir: Path       # where this match's solver caches are written

    def input_file(self, filename):
        return self.input_dir / filename

    def cache_file(self, filename):
        return self.cache_dir / filename


def resolve_match(team):
    """Input CSVs from the user's matches dir if that team folder exists there,
    else from the packaged samples; caches always in the user cache dir."""
    user_dir = user_matches_dir() / team
    input_dir = user_dir if user_dir.is_dir() else packaged_matches_dir() / team
    return MatchPaths(input_dir=input_dir, cache_dir=user_cache_root() / team)


def list_available_teams():
    """Team folder names from the user matches dir and the packaged samples,
    deduped (a user folder shadows a packaged sample of the same name)."""
    teams = set()
    for source in (user_matches_dir(), packaged_matches_dir()):
        if source.is_dir():
            for entry in os.listdir(source):
                if (source / entry).is_dir():
                    teams.add(entry)
    return sorted(teams)
