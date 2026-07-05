"""Shared test infrastructure for golden-value tests.

Isolation mechanism (see also drafter/tests/_solve_fixture.py): the B2
solver-context refactor (GitHub issue #13) moved per-run solver state onto an
explicit SolverContext, but a few correctness-neutral memoisation caches remain
module-level (the LP normalised cache in drafter.common.utilities). Rather than
reason about which module state does or doesn't reset cleanly between fixtures,
each golden test solves its fixture in a fresh `python -m ...`-style subprocess,
exactly like scripts/smoke_draft.py already does for the interactive draft. That
guarantees zero state leakage between tests/fixtures at the cost of a fresh
Python startup per test (cheap relative to solve time here).
"""
import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SOLVE_FIXTURE_SCRIPT = Path(__file__).resolve().parent / "_solve_fixture.py"


def solve_fixture(fixture_name, k, timeout=None):
    """Solve `fixture_name` fresh (no cache read/write) at the given
    restricted-attackers k, in a subprocess, and return a dict:
        {"n": int, "value": float, "friendly": [[name, prob], ...], "enemy": [...]}
    Raises AssertionError with the subprocess output on failure, so pytest
    failures show the solver's own error messages.
    """
    completed = subprocess.run(
        [sys.executable, str(SOLVE_FIXTURE_SCRIPT), fixture_name, str(k)],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        timeout=timeout,
    )

    if completed.returncode != 0:
        raise AssertionError(
            "Solving fixture {!r} (k={}) failed with exit code {}.\n--- stdout ---\n{}\n--- stderr ---\n{}".format(
                fixture_name, k, completed.returncode, completed.stdout, completed.stderr))

    stdout = completed.stdout
    try:
        begin = stdout.index("GOLDEN_RESULT_JSON_BEGIN") + len("GOLDEN_RESULT_JSON_BEGIN")
        end = stdout.index("GOLDEN_RESULT_JSON_END")
        payload = stdout[begin:end].strip()
        return json.loads(payload)
    except ValueError:
        raise AssertionError(
            "Could not find golden-result JSON in subprocess output for fixture {!r} (k={}).\n"
            "--- stdout ---\n{}\n--- stderr ---\n{}".format(fixture_name, k, stdout, completed.stderr))


def strategy_probabilities(strategy_entries):
    """Extract just the probabilities, in the order returned, from a
    [[name_or_pair, probability], ...] strategy list."""
    return [entry[1] for entry in strategy_entries]


def support_set(strategy_entries, threshold=1e-3):
    """Names/pairs with non-negligible probability, order-independent (as a
    frozenset of tuples) -- stable even if the solver returns strategy vectors
    with a different tie-break order or picks a different (equally valid)
    equilibrium across platforms/runs."""
    names = []
    for entry in strategy_entries:
        name = entry[0]
        if isinstance(name, list):
            name = tuple(name)
        if entry[1] > threshold:
            names.append(name)
    return frozenset(names)
