"""Tests for per-user match/cache path resolution (GitHub issue #26): a
pip/pipx user's own match folders (in the platform data dir) are searched before
the packaged samples, and solver caches go to the platform cache dir instead of
site-packages. Packaged folders stay read-only samples.

In-process: paths.user_matches_dir / user_cache_root are monkeypatched to
tmp_path, so nothing touches the real user directories.
"""
from pathlib import Path

import drafter.data.paths as paths
import drafter.data.read_write as read_write


def test_resolve_match_falls_back_to_packaged(monkeypatch, tmp_path):
    monkeypatch.setattr(paths, "user_matches_dir", lambda: tmp_path / "user" / "matches")
    monkeypatch.setattr(paths, "user_cache_root", lambda: tmp_path / "cache")

    match_paths = paths.resolve_match("Smoke")

    # No user "Smoke" folder -> input resolves to the packaged sample.
    assert match_paths.input_dir == paths.packaged_matches_dir() / "Smoke"
    assert match_paths.input_file("pairing_matrix_best.csv").is_file()
    # Cache always goes to the (writable) user cache dir, never the package.
    assert match_paths.cache_dir == tmp_path / "cache" / "Smoke"


def test_resolve_match_prefers_user_dir(monkeypatch, tmp_path):
    user = tmp_path / "user" / "matches"
    (user / "MyTeam").mkdir(parents=True)
    monkeypatch.setattr(paths, "user_matches_dir", lambda: user)
    monkeypatch.setattr(paths, "user_cache_root", lambda: tmp_path / "cache")

    match_paths = paths.resolve_match("MyTeam")

    assert match_paths.input_dir == user / "MyTeam"


def test_list_available_teams_unions_and_dedupes(monkeypatch, tmp_path):
    user = tmp_path / "user" / "matches"
    (user / "UserOnly").mkdir(parents=True)
    (user / "Smoke").mkdir()  # same name as a packaged sample -> deduped
    monkeypatch.setattr(paths, "user_matches_dir", lambda: user)

    teams = paths.list_available_teams()

    assert "UserOnly" in teams          # from the user dir
    assert "Scotland" in teams          # from the packaged samples
    assert teams.count("Smoke") == 1    # user folder shadows the packaged one
    assert teams == sorted(teams)


def test_list_available_teams_without_user_dir(monkeypatch, tmp_path):
    monkeypatch.setattr(paths, "user_matches_dir", lambda: tmp_path / "absent")

    teams = paths.list_available_teams()

    assert "Smoke" in teams  # packaged samples still listed when no user dir


def test_match_paths_join():
    match_paths = paths.MatchPaths(input_dir=Path("in"), cache_dir=Path("cache"))
    assert match_paths.input_file("x.csv") == Path("in") / "x.csv"
    assert match_paths.cache_file("y.json") == Path("cache") / "y.json"


def test_write_dictionary_creates_missing_cache_dir(tmp_path):
    target = tmp_path / "fresh" / "nested" / "gamestate.json"
    read_write.write_dictionary(target, [[1, 2], [3, 4]])
    assert target.is_file()
