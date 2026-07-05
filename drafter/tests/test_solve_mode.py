"""Solve-mode selection tests (GitHub issue #16).

Guards the exact-by-default decision (PLAN.md B5): the shipped SolverConfig
default must be the unrestricted/exact solve -- the true equilibrium -- with the
k-restriction heuristic available only as an explicit fast preview. These are
the cheap default-guards that stop the default silently flipping back to a
restricted (approximate) solve; the existing golden-value tests deliberately
pin k explicitly (see test_golden_values.py) and so would NOT catch such a
regression.
"""
import drafter.data.set_solve_mode as set_solve_mode
from drafter.solver.context import SolverConfig


def test_default_config_is_exact():
    # Bare SolverConfig() -- what `python -m drafter` and the smoke script build
    # -- must run the true-equilibrium solve, not the k-restricted heuristic.
    assert SolverConfig().restrict_attackers is False


def test_turning_on_restriction_defaults_to_preview_k():
    # Opting into the heuristic without naming k gives the documented k=3 fast
    # preview (B5), so a bare SolverConfig(restrict_attackers=True) IS the preview.
    assert SolverConfig(restrict_attackers=True).restricted_attackers_count == 3


def test_preview_mode_is_k3_restricted():
    # The startup prompt's "fast preview" choice.
    config = set_solve_mode.config_for_mode(preview=True)
    assert config.restrict_attackers is True
    assert config.restricted_attackers_count == 3


def test_exact_mode_is_unrestricted():
    # The startup prompt's default "exact" choice.
    config = set_solve_mode.config_for_mode(preview=False)
    assert config.restrict_attackers is False
