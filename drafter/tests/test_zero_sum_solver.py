"""Unit tests for the direct zero-sum game solver (GitHub issue #12 / PLAN.md
step B1).

Every game in the draft tree is zero-sum: the row (friendly) player maximises
the payoff matrix, the column (enemy) player minimises it. utilities.
get_game_solution solves such a game directly -- 2x2 games by closed form,
larger games by one scipy.optimize.linprog (HiGHS) call per side -- returning
[row_strategy, column_strategy, value].

The value of a zero-sum game is unique, so it is asserted exactly. Strategies
are checked by the equilibrium security property rather than pinned vectors:
an equilibrium (x, y) with value v must satisfy, for the row maximiser and
column minimiser respectively,

    min_j (x . A[:, j]) >= v      (x guarantees the row player at least v)
    max_i (A[i, :] . y) <= v      (y holds the row player to at most v)

which is equilibrium-selection agnostic (any optimal vertex passes) and, taken
together, proves v is the game value.
"""
import numpy as np
import pytest

import drafter.common.utilities as utilities


def assert_valid_equilibrium(game_array, solution, tol=1e-6):
    row_strategy, column_strategy, value = solution
    a = np.asarray(game_array, dtype=float)

    row_strategy = np.asarray(row_strategy, dtype=float)
    column_strategy = np.asarray(column_strategy, dtype=float)

    # Probability distributions.
    assert row_strategy.shape == (a.shape[0],)
    assert column_strategy.shape == (a.shape[1],)
    assert row_strategy.sum() == pytest.approx(1.0, abs=tol)
    assert column_strategy.sum() == pytest.approx(1.0, abs=tol)
    assert (row_strategy >= -tol).all()
    assert (column_strategy >= -tol).all()

    # Security property: the row strategy guarantees at least `value` against
    # every pure column, and the column strategy holds the row player to at
    # most `value` against every pure row.
    assert (row_strategy @ a).min() >= value - tol
    assert (a @ column_strategy).max() <= value + tol


def test_2x2_mixed_matching_pennies():
    a = np.array([[1.0, -1.0], [-1.0, 1.0]])
    solution = utilities.get_game_solution(a)
    assert solution[2] == pytest.approx(0.0, abs=1e-12)
    assert solution[0] == pytest.approx([0.5, 0.5], abs=1e-12)
    assert solution[1] == pytest.approx([0.5, 0.5], abs=1e-12)
    assert_valid_equilibrium(a, solution)


def test_2x2_mixed_known_value():
    # D = a11 + a22 - a12 - a21 = 2 + 1 + 1 + 1 = 5
    # value = (2*1 - (-1)*(-1)) / 5 = 1/5 ; p1 = q1 = (1 - (-1)) / 5 = 0.4
    a = np.array([[2.0, -1.0], [-1.0, 1.0]])
    solution = utilities.get_game_solution(a)
    assert solution[2] == pytest.approx(0.2, abs=1e-12)
    assert solution[0] == pytest.approx([0.4, 0.6], abs=1e-12)
    assert solution[1] == pytest.approx([0.4, 0.6], abs=1e-12)
    assert_valid_equilibrium(a, solution)


def test_2x2_saddle_point_pure():
    # Row 0 has the largest row-minimum (3, at column 1); column 1 has the
    # smallest column-maximum (3). Saddle at (0, 1) => value 3, pure strategies.
    a = np.array([[4.0, 3.0], [2.0, 1.0]])
    solution = utilities.get_game_solution(a)
    assert solution[2] == pytest.approx(3.0, abs=1e-12)
    assert solution[0] == pytest.approx([1.0, 0.0], abs=1e-12)
    assert solution[1] == pytest.approx([0.0, 1.0], abs=1e-12)
    assert_valid_equilibrium(a, solution)


def test_2x2_dominated_row_saddle():
    # Row 1 strictly dominates row 0; column then minimises down row 1.
    a = np.array([[1.0, 2.0], [3.0, 4.0]])
    solution = utilities.get_game_solution(a)
    assert solution[2] == pytest.approx(3.0, abs=1e-12)
    assert_valid_equilibrium(a, solution)


def test_2x2_constant_matrix():
    a = np.array([[5.0, 5.0], [5.0, 5.0]])
    solution = utilities.get_game_solution(a)
    assert solution[2] == pytest.approx(5.0, abs=1e-12)
    assert_valid_equilibrium(a, solution)


def test_3x3_rock_paper_scissors_via_lp():
    a = np.array([[0.0, -1.0, 1.0], [1.0, 0.0, -1.0], [-1.0, 1.0, 0.0]])
    solution = utilities.get_game_solution(a)
    assert solution[2] == pytest.approx(0.0, abs=1e-9)
    assert solution[0] == pytest.approx([1 / 3, 1 / 3, 1 / 3], abs=1e-6)
    assert solution[1] == pytest.approx([1 / 3, 1 / 3, 1 / 3], abs=1e-6)
    assert_valid_equilibrium(a, solution)


def test_3x3_general_via_lp():
    a = np.array([[3.0, -1.0, -3.0], [-2.0, 4.0, -1.0], [-5.0, -6.0, 2.0]])
    solution = utilities.get_game_solution(a)
    assert_valid_equilibrium(a, solution)


def test_non_square_via_lp():
    # 2 rows, 3 columns -- exercises the LP path with unequal dimensions.
    a = np.array([[3.0, -1.0, 0.0], [-2.0, 1.0, 2.0]])
    solution = utilities.get_game_solution(a)
    assert len(solution[0]) == 2
    assert len(solution[1]) == 3
    assert_valid_equilibrium(a, solution)


def test_shifted_value_translation_invariance():
    # Adding a constant c to every payoff shifts the game value by exactly c
    # (a check that the LP's positivity shift is undone correctly).
    a = np.array([[0.0, -1.0, 1.0], [1.0, 0.0, -1.0], [-1.0, 1.0, 0.0]])
    base = utilities.get_game_solution(a)[2]
    shifted = utilities.get_game_solution(a + 7.0)[2]
    assert shifted == pytest.approx(base + 7.0, abs=1e-9)


# A spread of 2x2 matrices covering mixed, dominated-row, dominated-column and
# degenerate (repeated / zero-denominator) cases. The closed form must return
# a valid equilibrium and the unique game value for every one of them.
CLOSED_FORM_CASES = [
    [[1.0, -1.0], [-1.0, 1.0]],
    [[2.0, -3.0], [-4.0, 1.0]],
    [[0.0, 4.0], [4.0, 0.0]],
    [[4.0, 3.0], [2.0, 1.0]],      # saddle
    [[1.0, 2.0], [3.0, 4.0]],      # dominated row
    [[5.0, 1.0], [4.0, 2.0]],      # dominated column
    [[-2.0, -2.0], [-2.0, -2.0]],  # constant
    [[10.0, -10.0], [-5.0, 5.0]],
    [[0.5, -0.5], [-0.25, 0.75]],
]


@pytest.mark.parametrize("matrix", CLOSED_FORM_CASES)
def test_closed_form_2x2_is_valid_equilibrium(matrix):
    a = np.array(matrix)
    solution = utilities.get_game_solution(a)
    assert_valid_equilibrium(a, solution)
