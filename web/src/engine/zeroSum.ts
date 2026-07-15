/**
 * Direct zero-sum game solving — the TS port of drafter/common/utilities.py:
 * a pure saddle point when one exists, else the 2×2 closed form,
 * else one small dense simplex on Float64Array. No LP library — scipy's
 * per-call overhead is the thing being escaped (§7.2), and the games here are
 * at most 21×21.
 *
 * The row (friendly) player maximises, the column (enemy) player minimises.
 * A zero-sum game's VALUE is unique; the mixed strategies are not (degenerate
 * games have many equilibria), so conformance asserts values directly and
 * strategies only as epsilon-equilibria.
 *
 * Matrices are flat row-major Float64Arrays (or number[]) of m*n entries.
 */

export interface GameSolution {
  row: number[];
  col: number[];
  value: number;
}

// --- 2×2 closed form (the ~90% common case in the tree) ---
// A 2×2 zero-sum game is either fully mixed or has a pure saddle point. The
// mixed formula is tried first; a probability outside [0, 1] (or a zero
// denominator) means no interior equilibrium exists, so a saddle point does.
// Same tie-breaking as the Python engine so strategies match bit-for-bit.

export function value2x2(a11: number, a12: number, a21: number, a22: number): number {
  const denominator = a11 + a22 - a12 - a21;

  if (denominator !== 0) {
    const rowProbability = (a22 - a21) / denominator;
    const columnProbability = (a22 - a12) / denominator;
    if (rowProbability >= 0 && rowProbability <= 1 && columnProbability >= 0 && columnProbability <= 1) {
      return (a11 * a22 - a12 * a21) / denominator;
    }
  }

  const bestRow = Math.min(a11, a12) >= Math.min(a21, a22) ? 0 : 1;
  const bestColumn = Math.max(a11, a21) <= Math.max(a12, a22) ? 0 : 1;
  return bestRow === 0 ? (bestColumn === 0 ? a11 : a12) : (bestColumn === 0 ? a21 : a22);
}

export function solve2x2(a11: number, a12: number, a21: number, a22: number): GameSolution {
  const denominator = a11 + a22 - a12 - a21;

  if (denominator !== 0) {
    const rowProbability = (a22 - a21) / denominator;
    const columnProbability = (a22 - a12) / denominator;
    if (rowProbability >= 0 && rowProbability <= 1 && columnProbability >= 0 && columnProbability <= 1) {
      return {
        row: [rowProbability, 1 - rowProbability],
        col: [columnProbability, 1 - columnProbability],
        value: (a11 * a22 - a12 * a21) / denominator,
      };
    }
  }

  const bestRow = Math.min(a11, a12) >= Math.min(a21, a22) ? 0 : 1;
  const bestColumn = Math.max(a11, a21) <= Math.max(a12, a22) ? 0 : 1;
  const row = [0, 0]; row[bestRow] = 1;
  const col = [0, 0]; col[bestColumn] = 1;
  const value = bestRow === 0 ? (bestColumn === 0 ? a11 : a12) : (bestColumn === 0 ? a21 : a22);
  return { row, col, value };
}

// --- larger games: pure saddle first (two array reductions), else simplex ---
// A pure saddle exists iff the maximin (best row-minimum) equals the minimax
// (best column-maximum). First-index tie-breaking matches numpy argmax/argmin.

function findSaddle(a: ArrayLike<number>, m: number, n: number):
    { bestRow: number; bestColumn: number; value: number } | null {
  let bestRow = 0;
  let maximin = -Infinity;
  for (let i = 0; i < m; i++) {
    let rowMin = Infinity;
    const base = i * n;
    for (let j = 0; j < n; j++) {
      const v = a[base + j];
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > maximin) { maximin = rowMin; bestRow = i; }
  }

  let bestColumn = 0;
  let minimax = Infinity;
  for (let j = 0; j < n; j++) {
    let colMax = -Infinity;
    for (let i = 0; i < m; i++) {
      const v = a[i * n + j];
      if (v > colMax) colMax = v;
    }
    if (colMax < minimax) { minimax = colMax; bestColumn = j; }
  }

  if (maximin === minimax) return { bestRow, bestColumn, value: a[bestRow * n + bestColumn] };
  return null;
}

export function gameValue(a: ArrayLike<number>, m: number, n: number): number {
  if (m === 2 && n === 2) return value2x2(a[0], a[1], a[2], a[3]);
  const saddle = findSaddle(a, m, n);
  if (saddle !== null) return saddle.value;
  return simplexSolve(a, m, n).value;
}

export function solveGame(a: ArrayLike<number>, m: number, n: number): GameSolution {
  if (m === 2 && n === 2) return solve2x2(a[0], a[1], a[2], a[3]);

  const saddle = findSaddle(a, m, n);
  if (saddle !== null) {
    const row = new Array<number>(m).fill(0); row[saddle.bestRow] = 1;
    const col = new Array<number>(n).fill(0); col[saddle.bestColumn] = 1;
    return { row, col, value: saddle.value };
  }

  return simplexSolve(a, m, n);
}

// --- the bespoke dense simplex (§7.2: "a bespoke ~100-line dense simplex") ---
//
// Shift the payoff matrix strictly positive (value v > 0), then solve the
// column player's LP in standard maximisation form:
//
//     max 1'y   s.t.   A y <= 1,  y >= 0        (y = column mix / v)
//
// The origin (slack basis) is feasible, so no phase-1 is needed. At the
// optimum, 1'y = 1/v; the column strategy is y*v, and the row player's
// strategy falls out of the same tableau as the duals — the reduced costs of
// the slack columns — times v. This is the same primal/dual pair the Python
// engine solves through scipy (utilities.solve_zero_sum_game_by_linear_program
// takes the row side and reads the column side from the marginals).
//
// Bland's rule (first eligible entering column, lowest basis index on exact
// ratio ties) prevents cycling on the degenerate games the discrete rating
// scale produces; with floating-point ratios the guarantee is heuristic, so
// the iteration cap below is the hard backstop. At <=21×21 its extra pivots
// are irrelevant.

const EPS = 1e-12;

function simplexSolve(a: ArrayLike<number>, m: number, n: number): GameSolution {
  let shift = Infinity;
  for (let i = 0; i < m * n; i++) if (a[i] < shift) shift = a[i];

  const columns = n + m + 1;
  const rhsColumn = n + m;
  const tableau = new Float64Array((m + 1) * columns);
  for (let i = 0; i < m; i++) {
    const base = i * columns;
    for (let j = 0; j < n; j++) tableau[base + j] = a[i * n + j] - shift + 1;
    tableau[base + n + i] = 1;
    tableau[base + rhsColumn] = 1;
  }
  const objectiveBase = m * columns;
  for (let j = 0; j < n; j++) tableau[objectiveBase + j] = -1;

  const basis = new Int32Array(m);
  for (let i = 0; i < m; i++) basis[i] = n + i;

  const maxIterations = 200 * (m + n);
  for (let iteration = 0; ; iteration++) {
    if (iteration >= maxIterations) throw new Error('Simplex failed to terminate.');

    let pivotColumn = -1;
    for (let j = 0; j < n + m; j++) {
      if (tableau[objectiveBase + j] < -EPS) { pivotColumn = j; break; }
    }
    if (pivotColumn === -1) break;

    let pivotRow = -1;
    let bestRatio = Infinity;
    for (let i = 0; i < m; i++) {
      const coefficient = tableau[i * columns + pivotColumn];
      if (coefficient > EPS) {
        const ratio = tableau[i * columns + rhsColumn] / coefficient;
        if (ratio < bestRatio || (ratio === bestRatio && basis[i] < basis[pivotRow])) {
          bestRatio = ratio;
          pivotRow = i;
        }
      }
    }
    if (pivotRow === -1) throw new Error('Unbounded LP; impossible for a positivity-shifted game.');

    const pivotBase = pivotRow * columns;
    const pivotValue = tableau[pivotBase + pivotColumn];
    for (let j = 0; j < columns; j++) tableau[pivotBase + j] /= pivotValue;
    for (let i = 0; i <= m; i++) {
      if (i === pivotRow) continue;
      const factor = tableau[i * columns + pivotColumn];
      if (factor === 0) continue;
      const base = i * columns;
      for (let j = 0; j < columns; j++) tableau[base + j] -= factor * tableau[pivotBase + j];
    }
    basis[pivotRow] = pivotColumn;
  }

  const shiftedValue = 1 / tableau[objectiveBase + rhsColumn];

  const col = new Array<number>(n).fill(0);
  for (let i = 0; i < m; i++) {
    if (basis[i] < n) col[basis[i]] = tableau[i * columns + rhsColumn] * shiftedValue;
  }
  const row = new Array<number>(m);
  for (let i = 0; i < m; i++) row[i] = tableau[objectiveBase + n + i] * shiftedValue;

  // Reduced costs in (-EPS, 0] can leave strategies with tiny negative
  // entries; clamp and renormalise so a NodeResult.prob is always a
  // distribution (the Python side gets this from np.abs of the marginals).
  return { row: toDistribution(row), col: toDistribution(col), value: shiftedValue + shift - 1 };
}

function toDistribution(weights: number[]): number[] {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) {
    if (weights[i] < 0) weights[i] = 0;
    sum += weights[i];
  }
  for (let i = 0; i < weights.length; i++) weights[i] /= sum;
  return weights;
}
