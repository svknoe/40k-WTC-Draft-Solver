"""Unit tests for the 11th-edition best/worst map model (GitHub issue #9 /
PLAN.md workstream C): rating normalisation to the internal margin scale,
defender-dependent pairing values, best/worst consistency validation, and the
cache-format marker that invalidates caches computed under the old value model.

Unlike the golden-value tests these run in-process: everything exercised here
is either a pure function or restored via monkeypatch, and the golden tests
solve in fresh subprocesses anyway (see conftest.py), so no state can leak
into them.
"""
import pytest

import drafter.common.utilities as utilities
import drafter.data.initialise_dictionaries as initialise_dictionaries
import drafter.data.match_info as match_info
import drafter.data.read_write as read_write
import drafter.data.settings as settings


# --- parse_rating: legacy tokens ---

@pytest.mark.parametrize("token,margin", [("--", -8), ("-", -4), ("0", 0), ("+", 4), ("++", 8)])
def test_parse_rating_legacy_tokens(token, margin):
    assert initialise_dictionaries.parse_rating(token) == margin


# --- parse_rating: 0-20 scores, internal = score - 10 (deviation scale) ---

@pytest.mark.parametrize("score,deviation", [
    ("20", 10), ("15", 5), ("12.5", 2.5), ("10", 0), ("3", -7), ("1", -9),
])
def test_parse_rating_scores(score, deviation):
    assert initialise_dictionaries.parse_rating(score) == deviation


def test_parse_rating_numbers_agree_with_tokens():
    # The bug fixed by issue #30: numeric input used to parse as
    # 2*(score-10) while tokens kept face values, so '14' and '+' (the same
    # expected 14-6 game) got different internal values.
    assert initialise_dictionaries.parse_rating("14") == initialise_dictionaries.parse_rating("+") == 4
    assert initialise_dictionaries.parse_rating("2") == initialise_dictionaries.parse_rating("--") == -8


def test_parse_rating_bare_zero_is_the_legacy_token_not_the_score():
    # '0' collides between the two accepted notations; the legacy token (an
    # even matchup, deviation 0) wins, because '0' is the most common cell in
    # old-style matrices and reading it as a 0-20 blowout would silently
    # corrupt all of them. '0.0' is not a token and parses as the score.
    assert initialise_dictionaries.parse_rating("0") == 0
    assert initialise_dictionaries.parse_rating("0.0") == -10


@pytest.mark.parametrize("value", ["21", "-1", "-4.0", "x", "+++", ""])
def test_parse_rating_rejects_junk_and_out_of_scale(value):
    with pytest.raises(ValueError):
        initialise_dictionaries.parse_rating(value)


@pytest.mark.parametrize("value,deviation", [(" 0", 0), ("0 ", 0), (" ++", 8), (" 15", 5)])
def test_parse_rating_strips_whitespace_before_token_lookup(value, deviation):
    # float() ignores whitespace but a dict lookup does not; without stripping,
    # ' 0' would silently parse as the 0-20 score 0 (deviation -10) instead of
    # the legacy even-matchup token.
    assert initialise_dictionaries.parse_rating(value) == deviation


# --- get_pairing_value: defender picks the map ---

@pytest.fixture
def small_match(monkeypatch):
    monkeypatch.setattr(match_info, "pairing_dictionary_best", {"Alice": {"Ork": 6.0}})
    monkeypatch.setattr(match_info, "pairing_dictionary_worst", {"Alice": {"Ork": 2.0}})


def test_pairing_value_friendly_defender_gets_best_map(small_match):
    assert utilities.get_pairing_value("Alice", "Ork", defender="Alice") == 6.0


def test_pairing_value_enemy_defender_forces_worst_map(small_match):
    assert utilities.get_pairing_value("Alice", "Ork", defender="Ork") == 2.0


def test_pairing_value_no_defender_uses_neutral_weight(small_match, monkeypatch):
    monkeypatch.setattr(settings, "neutral_map_weight", 0.5)
    assert utilities.get_pairing_value("Alice", "Ork") == 4.0

    monkeypatch.setattr(settings, "neutral_map_weight", 0.25)
    assert utilities.get_pairing_value("Alice", "Ork") == 3.0


def test_pairing_value_unknown_defender_raises(small_match):
    with pytest.raises(ValueError):
        utilities.get_pairing_value("Alice", "Ork", defender="Bob")


# --- validate_best_not_below_worst ---

def test_best_below_worst_raises(monkeypatch):
    monkeypatch.setattr(match_info, "pairing_dictionary_best", {"Alice": {"Ork": 2.0}})
    monkeypatch.setattr(match_info, "pairing_dictionary_worst", {"Alice": {"Ork": 6.0}})
    with pytest.raises(ValueError, match="Best-map value"):
        initialise_dictionaries.validate_best_not_below_worst()


def test_missing_worst_entry_raises(monkeypatch):
    monkeypatch.setattr(match_info, "pairing_dictionary_best", {"Alice": {"Ork": 2.0}})
    monkeypatch.setattr(match_info, "pairing_dictionary_worst", {"Alice": {}})
    with pytest.raises(ValueError, match="missing"):
        initialise_dictionaries.validate_best_not_below_worst()


# --- reading a CSV that mixes tokens and 0-20 scores ---

def test_input_dictionary_accepts_mixed_tokens_and_scores(monkeypatch, tmp_path):
    csv_path = tmp_path / "pairing_matrix_best.csv"
    csv_path.write_text(
        "Alice,Bob,Carol,Dave\n"
        "Ork,Eldar,Chaos,Tau\n"
        "++,15,0,8.5\n"
        "-,10,+,12\n"
        "0,--,20,4\n"
        "+,0.0,17,-\n", encoding="utf-8")
    monkeypatch.setattr(utilities, "get_path", lambda filename: csv_path)

    result = {}
    initialise_dictionaries.initialise_input_dictionary(result, "pairing_matrix_best.csv")

    assert result == {
        "Alice": {"Ork": 8, "Eldar": 5.0, "Chaos": 0, "Tau": -1.5},
        "Bob": {"Ork": -4, "Eldar": 0.0, "Chaos": 4, "Tau": 2.0},
        "Carol": {"Ork": 0, "Eldar": -8, "Chaos": 10.0, "Tau": -6.0},
        "Dave": {"Ork": 4, "Eldar": -10.0, "Chaos": 7.0, "Tau": -4},
    }


# --- cache-format marker ---

def test_cache_marker_roundtrip(tmp_path):
    marker = tmp_path / read_write.CACHE_FORMAT_FILENAME
    assert not read_write.cache_format_is_current(marker)  # no file

    read_write.write_cache_format_marker(marker)
    assert read_write.cache_format_is_current(marker)


def test_cache_marker_rejects_old_version_and_corrupt_file(tmp_path):
    marker = tmp_path / read_write.CACHE_FORMAT_FILENAME
    marker.write_text('{"cache_format_version": 1}', encoding="utf-8")
    assert not read_write.cache_format_is_current(marker)

    marker.write_text("not json", encoding="utf-8")
    assert not read_write.cache_format_is_current(marker)
