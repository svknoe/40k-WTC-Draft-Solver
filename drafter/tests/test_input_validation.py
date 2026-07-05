"""Tests for honest CSV validation errors (GitHub issue #11): every failure
mode of read_pairing_matrix must raise InputError with a message that names
the actual problem and its location, instead of the old behaviour of masking
everything behind a bare except as 'Missing file'.

In-process: read_pairing_matrix is exercised directly on tmp_path files, and
the golden tests solve in fresh subprocesses, so nothing leaks.
"""
import pytest

import drafter.data.initialise_dictionaries as initialise_dictionaries
from drafter.data.initialise_dictionaries import InputError


def read_csv(tmp_path, content, encoding="utf-8", require_unique_names=True):
    csv_path = tmp_path / "pairing_matrix_best.csv"
    if isinstance(content, bytes):
        csv_path.write_bytes(content)
    else:
        csv_path.write_text(content, encoding=encoding)

    return initialise_dictionaries.read_pairing_matrix(csv_path, require_unique_names)


VALID_4_PLAYER = (
    "Alice,Bob,Carol,Dave\n"
    "Ork,Eldar,Chaos,Tau\n"
    "10,11,12,13\n"
    "9,10,11,12\n"
    "8,9,10,11\n"
    "7,8,9,10\n"
)


def test_valid_matrix_loads(tmp_path):
    result = read_csv(tmp_path, VALID_4_PLAYER)
    assert result["Alice"]["Ork"] == 0
    assert result["Dave"]["Tau"] == 0
    assert result["Dave"]["Ork"] == -3


def test_blank_lines_are_skipped_and_line_numbers_stay_real(tmp_path):
    content = VALID_4_PLAYER.replace("9,10,11,12\n", "9,10,11,12\n\n")
    result = read_csv(tmp_path, content)
    assert result["Dave"]["Tau"] == 0

    # An error after the blank line must report the real file line, not the
    # position among non-blank rows (Carol's row is line 6 in the file now).
    content_with_error = content.replace("8,9,10,11", "8,9,x,11")
    with pytest.raises(InputError, match=r"line 6, column 3 \(Carol vs Chaos\)"):
        read_csv(tmp_path, content_with_error)


def test_excel_utf8_bom_is_stripped(tmp_path):
    # Excel's "CSV UTF-8" prefixes a BOM; plain utf-8 reading would glue
    # U+FEFF onto the first player name, and str.strip() does not remove it.
    result = read_csv(tmp_path, VALID_4_PLAYER.encode("utf-8-sig"))
    assert "Alice" in result


def test_empty_player_name_from_trailing_comma(tmp_path):
    content = VALID_4_PLAYER.replace("Alice,Bob,Carol,Dave", "Alice,Bob,Carol,Dave,")
    with pytest.raises(InputError, match="empty friendly player name"):
        read_csv(tmp_path, content)


def test_missing_file(tmp_path):
    with pytest.raises(InputError, match=r"Missing input file: .*pairing_matrix_best\.csv"):
        initialise_dictionaries.read_pairing_matrix(tmp_path / "pairing_matrix_best.csv", True)


def test_non_utf8_file(tmp_path):
    content = VALID_4_PLAYER.replace("Alice", "Bjørn").encode("latin-1")
    with pytest.raises(InputError, match="not UTF-8 encoded"):
        read_csv(tmp_path, content)


def test_fewer_than_two_header_rows(tmp_path):
    with pytest.raises(InputError, match="expected two header rows"):
        read_csv(tmp_path, "Alice,Bob,Carol,Dave\n")


def test_unknown_rating_names_line_column_and_players(tmp_path):
    content = VALID_4_PLAYER.replace("8,9,10,11", "8,9,x,11")
    with pytest.raises(InputError, match=r"line 5, column 3 \(Carol vs Chaos\): unknown rating 'x'"):
        read_csv(tmp_path, content)


def test_out_of_scale_rating_is_located_too(tmp_path):
    content = VALID_4_PLAYER.replace("10,11,12,13", "10,11,12,-4")
    with pytest.raises(InputError, match=r"line 3, column 4 \(Alice vs Tau\): unknown rating '-4'"):
        read_csv(tmp_path, content)


def test_ragged_row(tmp_path):
    content = VALID_4_PLAYER.replace("9,10,11,12", "9,10,11")
    with pytest.raises(InputError, match=r"line 4 \(Bob\): 3 ratings for 4 enemies"):
        read_csv(tmp_path, content)


def test_wrong_number_of_data_rows(tmp_path):
    content = VALID_4_PLAYER + "7,8,9,10\n"
    with pytest.raises(InputError, match="5 rating rows for 4 friendly players"):
        read_csv(tmp_path, content)


def test_header_rows_of_different_length(tmp_path):
    content = VALID_4_PLAYER.replace("Ork,Eldar,Chaos,Tau", "Ork,Eldar,Chaos")
    with pytest.raises(InputError, match="4 friendly names .* 3 enemy names"):
        read_csv(tmp_path, content)


def test_unsupported_player_count(tmp_path):
    content = (
        "A,B,C,D,E\n"
        "V,W,X,Y,Z\n" + "10,10,10,10,10\n" * 5)
    with pytest.raises(InputError, match="5 players per team; the draft needs 4, 6 or 8"):
        read_csv(tmp_path, content)


def test_duplicate_name_across_teams(tmp_path):
    content = VALID_4_PLAYER.replace("Ork,Eldar,Chaos,Tau", "Ork,Alice,Chaos,Tau")
    with pytest.raises(InputError, match="name\\(s\\) present on both teams: Alice"):
        read_csv(tmp_path, content)


def test_duplicate_name_across_teams_allowed_when_setting_disabled(tmp_path):
    content = VALID_4_PLAYER.replace("Ork,Eldar,Chaos,Tau", "Ork,Alice,Chaos,Tau")
    result = read_csv(tmp_path, content, require_unique_names=False)
    assert result["Bob"]["Alice"] == 0


def test_duplicate_name_within_a_team(tmp_path):
    content = VALID_4_PLAYER.replace("Alice,Bob,Carol,Dave", "Alice,Bob,Alice,Dave")
    with pytest.raises(InputError, match="duplicate friendly player name\\(s\\): Alice"):
        read_csv(tmp_path, content)
