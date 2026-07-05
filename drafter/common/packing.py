"""Packed-integer encoding of team permutations and gamestates (GitHub issue
#13, B2). Replaces the verbose human-readable string keys.

A team permutation over <=8 players packs into a 24-bit int:

    bits  0..7  : remaining-players bitmask (bit i set => player i remains)
    bits  8..11 : defender           (4 bits, ROLE_NONE = 0xF when unset)
    bits 12..15 : attacker_A         (4 bits)
    bits 16..19 : attacker_B         (4 bits)
    bits 20..23 : discarded_attacker (4 bits)

Indices are per side (friendly = CSV rows, enemy = CSV columns), 0..n-1. A
gamestate key is a single int: the friendly team code in the low 24 bits and the
enemy team code in the next 24 (so it fits a numpy int64 and packs the whole
state into one hashable/array-able value, B3). The draft stage is derivable from
either code (see draft_stage_of_code). Names live only in the presentation layer
(drafter.solver.context NameIndex).
"""
from drafter.common.draft_stage import DraftStage

ROLE_NONE = 0xF

_DEFENDER_SHIFT = 8
_ATTACKER_A_SHIFT = 12
_ATTACKER_B_SHIFT = 16
_DISCARDED_SHIFT = 20
_ROLE_MASK = 0xF
_REMAINING_MASK = 0xFF

# A team code occupies 24 bits; the gamestate key stacks enemy above friendly.
_TEAM_BITS = 24
_TEAM_MASK = (1 << _TEAM_BITS) - 1


def encode_gamestate(friendly_code, enemy_code):
    return friendly_code | (enemy_code << _TEAM_BITS)


def decode_gamestate(key):
    return (key & _TEAM_MASK, key >> _TEAM_BITS)


def _pack_role(index):
    return ROLE_NONE if index is None else index


def _unpack_role(code, shift):
    value = (code >> shift) & _ROLE_MASK
    return None if value == ROLE_NONE else value


def mask_from_indices(indices):
    mask = 0
    for index in indices:
        mask |= (1 << index)
    return mask


def indices_from_mask(mask):
    # Ascending index order -- reproduces the old "remaining players sorted"
    # canonicalisation for free (a bitmask is inherently order-free).
    return [i for i in range(8) if mask & (1 << i)]


def encode_team_permutation(remaining_mask, defender, attacker_a, attacker_b, discarded):
    return (remaining_mask
            | (_pack_role(defender) << _DEFENDER_SHIFT)
            | (_pack_role(attacker_a) << _ATTACKER_A_SHIFT)
            | (_pack_role(attacker_b) << _ATTACKER_B_SHIFT)
            | (_pack_role(discarded) << _DISCARDED_SHIFT))


def decode_team_permutation(code):
    """Return (remaining_mask, defender, attacker_A, attacker_B, discarded);
    roles are int index or None."""
    return (
        code & _REMAINING_MASK,
        _unpack_role(code, _DEFENDER_SHIFT),
        _unpack_role(code, _ATTACKER_A_SHIFT),
        _unpack_role(code, _ATTACKER_B_SHIFT),
        _unpack_role(code, _DISCARDED_SHIFT),
    )


def team_permutation_n(code):
    """Number of players on this team: popcount(remaining) + roles set. Mirrors
    the old TeamPermutation.get_n (remaining + defender + both attackers)."""
    remaining_mask, defender, attacker_a, attacker_b, _discarded = decode_team_permutation(code)
    n = bin(remaining_mask).count("1")
    if defender is not None:
        n += 1
    if attacker_a is not None:
        n += 1
    if attacker_b is not None:
        n += 1
    return n


def draft_stage_of_code(code):
    """Derive the draft stage from which roles are set, mirroring the old
    TeamPermutation.get_draft_stage."""
    _remaining_mask, defender, attacker_a, _attacker_b, discarded = decode_team_permutation(code)
    if discarded is not None:
        return DraftStage.discard_attacker
    elif attacker_a is not None:
        return DraftStage.select_attackers
    elif defender is not None:
        return DraftStage.select_defender
    else:
        return DraftStage.none
