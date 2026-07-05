"""Unit tests for the packed-integer team-permutation encoding (GitHub issue
#13, B2). The encode/decode round-trip and injectivity are what make the packed
int a drop-in replacement for the old string key: same dict semantics iff the
mapping is a bijection over the reachable permutations.
"""
import itertools

import pytest

from drafter.common import packing
from drafter.common.draft_stage import DraftStage


def test_mask_round_trip():
    for r in range(0, 4):
        for indices in itertools.combinations(range(8), r):
            mask = packing.mask_from_indices(indices)
            assert packing.indices_from_mask(mask) == sorted(indices)


def test_role_round_trip_including_none():
    cases = [
        (0b10110101, 0, 1, 2, 3),
        (0b11111111, 7, None, None, None),
        (0b00000000, None, None, None, None),
        (0b00001111, 3, 0, 5, 0),
        (0xFF, 6, 7, 4, 7),
    ]
    for remaining_mask, defender, attacker_a, attacker_b, discarded in cases:
        code = packing.encode_team_permutation(remaining_mask, defender, attacker_a, attacker_b, discarded)
        assert packing.decode_team_permutation(code) == (remaining_mask, defender, attacker_a, attacker_b, discarded)


def test_code_fits_in_24_bits():
    code = packing.encode_team_permutation(0xFF, 7, 7, 7, 7)
    assert code < (1 << 24)


def test_encoding_is_injective_over_a_broad_sample():
    seen = {}
    # Roles range over 0..7 and None (=ROLE_NONE); sample masks across the byte.
    role_values = list(range(8)) + [None]
    masks = list(range(0, 256, 7)) + [0, 255]
    for remaining_mask in masks:
        for defender in role_values:
            for attacker_a in (None, 0, 3, 7):
                for discarded in (None, 2, 5):
                    key = (remaining_mask, defender, attacker_a, 1, discarded)
                    code = packing.encode_team_permutation(*key)
                    assert code not in seen or seen[code] == key, \
                        "collision: {} and {} both -> {}".format(seen.get(code), key, code)
                    seen[code] = key


@pytest.mark.parametrize("defender,attacker_a,attacker_b,discarded,expected", [
    (None, None, None, None, DraftStage.none),
    (0, None, None, None, DraftStage.select_defender),
    (0, 1, 2, None, DraftStage.select_attackers),
    (0, 1, 2, 1, DraftStage.discard_attacker),
])
def test_draft_stage_of_code(defender, attacker_a, attacker_b, discarded, expected):
    code = packing.encode_team_permutation(0b1100, defender, attacker_a, attacker_b, discarded)
    assert packing.draft_stage_of_code(code) == expected


def test_team_permutation_n_counts_remaining_plus_roles():
    # 2 remaining + defender + 2 attackers = 5.
    code = packing.encode_team_permutation(packing.mask_from_indices([6, 7]), 0, 1, 2, None)
    assert packing.team_permutation_n(code) == 5
    # 8 remaining, no roles set (the initial 8-player 'none' permutation).
    code = packing.encode_team_permutation(packing.mask_from_indices(range(8)), None, None, None, None)
    assert packing.team_permutation_n(code) == 8
