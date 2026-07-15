/**
 * The TS draft engine core (issue #17 spike) — a port of the Python engine's
 * B1–B3 architecture (drafter/solver): breadth-first gamestate enumeration
 * into sorted key arrays, value-only backward induction deepest stage first,
 * and on-demand strategy/value recompute for the node the trainer is looking
 * at. Gamestate keys are 40-bit plain numbers (see packing.ts).
 *
 * Semantics deliberately mirror the Python engine move for move — option
 * enumeration order, restriction ranking, tie-breaking — so the conformance
 * fixtures exported from Python (web/src/conformance) pin this port against
 * the current source of truth.
 */

import {
  ROLE_NONE, TEAM_SPAN, encodeTeam, encodeNoneTeam, encodeGamestate,
  friendlyCodeOf, enemyCodeOf, maskIndices, popcount8, teamN, teamStage,
  StageName,
} from './packing';
import { RestrictionTables, FRIENDLY, ENEMY, heuristicallyBestAttackers } from './restriction';
import { gameValue, solveGame, value2x2, GameSolution } from './zeroSum';
import { Matrix, Move, NodeResult, NodeChoice } from './types';

export type ProgressCallback = (frac: number, phase: 'enumerating' | 'inducting') => void;

interface StageValues {
  keys: Float64Array;
  values: Float64Array;
}

/** One side of a decoded gamestate (roles are ROLE_NONE when unset). */
interface TeamState {
  mask: number;
  defender: number;
  attackerA: number;
  attackerB: number;
}

function teamCode(team: TeamState): number {
  return encodeTeam(team.mask, team.defender, team.attackerA, team.attackerB);
}

function decodeTeam(code: number): TeamState {
  return {
    mask: code & 0xff,
    defender: (code >> 8) & 0xf,
    attackerA: (code >> 12) & 0xf,
    attackerB: (code >> 16) & 0xf,
  };
}

/** Index of the single set bit (the even endgame's last remaining player).
 * Returns -1 for an empty mask — callers must guard, which the odd endgame
 * (empty remaining mask, no last player) does via its lastTerm ternaries. */
function singleIndex(mask: number): number {
  return 31 - Math.clz32(mask);
}

/** Attacker pairs in Python's itertools.combinations order over the eligible
 * list (which is ranked, not ascending, when the k-restriction is on),
 * flattened as [a0, b0, a1, b1, ...]. */
function attackerPairs(eligible: number[]): number[] {
  const pairs: number[] = [];
  for (let i = 0; i < eligible.length - 1; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      pairs.push(eligible[i], eligible[j]);
    }
  }
  return pairs;
}

function sortedUnique(array: Float64Array): Float64Array {
  array.sort();
  let unique = 0;
  for (let i = 0; i < array.length; i++) {
    if (i === 0 || array[i] !== array[i - 1]) array[unique++] = array[i];
  }
  // slice (copy), not subarray (view): a view would pin the full-size child
  // buffer alive — 4x the useful size on heavily-deduped levels.
  return unique === array.length ? array : array.slice(0, unique);
}

/** Binary-search lookup in parallel sorted (keys, values) arrays. */
function lookupValue(store: StageValues, key: number): number {
  const keys = store.keys;
  let low = 0;
  let high = keys.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const midKey = keys[mid];
    if (midKey < key) low = mid + 1;
    else if (midKey > key) high = mid - 1;
    else return store.values[mid];
  }
  throw new Error(`Gamestate key ${key} not in this stage's solved values.`);
}

function tryLookupValue(store: StageValues, key: number): number | undefined {
  const keys = store.keys;
  let low = 0;
  let high = keys.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const midKey = keys[mid];
    if (midKey < key) low = mid + 1;
    else if (midKey > key) high = mid - 1;
    else return store.values[mid];
  }
  return undefined;
}

/** A built game: payoff matrix (row-major, row player = friendly side's
 * decision) plus the option labels behind each row/column. */
interface BuiltGame {
  a: Float64Array;
  m: number;
  n: number;
  rowOptions: (number | [number, number])[];
  colOptions: (number | [number, number])[];
}

export class DraftEngine {
  readonly n: number;
  readonly myNames: string[];
  readonly enemyNames: string[];
  readonly k: number | null;

  /** Terminal-round team size: odd team sizes end at 3 (no last-vs-last
   * game), even at 4 (spec 2026-07-15-team-sizes-3-8). */
  private readonly endgameN: number;

  private readonly best: Float64Array;
  private readonly worst: Float64Array;
  private readonly neutral: Float64Array;
  private readonly restriction: RestrictionTables | null;

  private keyArrays = new Map<string, Float64Array>();
  private valueArrays = new Map<string, StageValues>();
  /** Values solved on demand for off-tree (non-k-restricted) moves. */
  private extensionValues = new Map<number, number>();
  private solved = false;

  /** Exact accounting of the engine's typed-array allocations: bytes held for
   * good (key/value arrays) plus the transient child buffers alive at any
   * moment. A deterministic floor for real heap use (excludes V8 overhead). */
  private allocStaticBytes = 0;
  private allocPeakBytes = 0;

  constructor(matrix: Matrix, k: number | null, neutralWeight = 0.5) {
    const n = matrix.n;
    // The engine owns the 8-bit-mask packing constraint but receives n across
    // the worker boundary as untyped data — an out-of-range n would corrupt
    // packed keys silently rather than fail, so guard it here.
    if (!Number.isInteger(n) || n < 3 || n > 8) {
      throw new Error(`Team size must be 3-8 (got ${n}).`);
    }
    this.n = n;
    this.myNames = matrix.myNames;
    this.enemyNames = matrix.enemyNames;
    this.k = k;
    this.endgameN = n % 2 === 1 ? 3 : 4;

    this.best = new Float64Array(n * n);
    this.worst = new Float64Array(n * n);
    this.neutral = new Float64Array(n * n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const cell = matrix.cells[i][j];
        this.best[i * n + j] = cell.best;
        this.worst[i * n + j] = cell.worst;
        this.neutral[i * n + j] = cell.worst + neutralWeight * (cell.best - cell.worst);
      }
    }

    this.restriction = k === null ? null : {
      k, n, best: this.best, worst: this.worst, neutral: this.neutral,
    };
  }

  private rootKey(): number {
    const full = (1 << this.n) - 1;
    return encodeGamestate(encodeNoneTeam(full), encodeNoneTeam(full));
  }

  /** Full solve: enumerate + value-only backward induction. Returns the
   * equilibrium expected team result on the internal scale. */
  solve(onProgress?: ProgressCallback): number {
    this.keyArrays.clear();
    this.valueArrays.clear();
    this.extensionValues.clear();
    this.allocStaticBytes = 0;
    this.allocPeakBytes = 0;

    this.enumerate(onProgress);
    this.induct(onProgress);
    this.solved = true;
    return this.expected();
  }

  expected(): number {
    return lookupValue(this.valueArrays.get(`${this.n}:none`)!, this.rootKey());
  }

  isSolved(): boolean {
    return this.solved;
  }

  /** Per-(n, stage) gamestate counts, for conformance against the Python
   * enumeration (pins the k-restriction's eligible-attacker choices too). */
  stageCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const [stage, keys] of this.keyArrays) counts[stage] = keys.length;
    return counts;
  }

  /** Engine-internal allocation floor: bytes held in key/value arrays. */
  storedBytes(): number {
    let bytes = 0;
    for (const keys of this.keyArrays.values()) bytes += keys.byteLength;
    for (const store of this.valueArrays.values()) bytes += store.values.byteLength;
    return bytes;
  }

  /** Peak of storedBytes + transient enumeration buffers over the solve. */
  peakAllocBytes(): number {
    return this.allocPeakBytes;
  }

  /** Off-tree gamestate values solved on demand so far (tests/diagnostics). */
  extensionCount(): number {
    return this.extensionValues.size;
  }

  private notePeak(transientBytes: number): void {
    const total = this.allocStaticBytes + transientBytes;
    if (total > this.allocPeakBytes) this.allocPeakBytes = total;
  }

  // --- eligible attackers (restriction applied when configured) ---

  private eligibleAttackers(
    side: number, remaining: number[], opposingDefender: number, opposingRemaining: number[],
  ): number[] {
    if (this.restriction === null) return remaining;
    return heuristicallyBestAttackers(
      this.restriction, side, remaining, opposingDefender, opposingRemaining);
  }

  // --- enumeration (port of game_state_dictionaries.enumerate_gamestates) ---

  private enumerate(onProgress?: ProgressCallback): void {
    // Levels run (n,none) → (n,sd) → (n,sa) → (n−2,none) → ... down to
    // (endgameN,sa) — e.g. (8,none)…(4,sa) or (5,none)…(3,sa); the
    // discard levels are pass-through (their game is decided at the parent
    // select_attackers state) and are skipped entirely by generating the
    // grandchildren none-states directly.
    const totalLevels = 3 * ((this.n - this.endgameN) / 2 + 1);
    let level: Float64Array = Float64Array.of(this.rootKey());
    let levelIndex = 0;

    while (level.length > 0) {
      const firstFriendly = friendlyCodeOf(level[0]);
      const levelN = teamN(firstFriendly);
      const stage = teamStage(firstFriendly);
      this.keyArrays.set(`${levelN}:${stage}`, level);
      this.allocStaticBytes += level.byteLength;
      this.notePeak(0);
      if (onProgress) onProgress(levelIndex / totalLevels, 'enumerating');
      levelIndex++;

      // The endgame-round discard is closed-form; stop before it.
      if (levelN === this.endgameN && stage === 'select_attackers') break;

      // Every state on a level has the same child count (same remaining-mask
      // popcount, same eligible-attacker count), so the child buffer can be
      // allocated exactly — no growing number[] on multi-million-key levels.
      const perState = this.childCount(level[0], stage);
      const children = new Float64Array(level.length * perState);
      let offset = 0;
      for (let index = 0; index < level.length; index++) {
        offset = this.pushChildren(level[index], stage, children, offset);
      }
      if (offset !== children.length) {
        throw new Error(`Enumeration wrote ${offset} children, expected ${children.length}.`);
      }
      this.notePeak(children.byteLength);
      level = sortedUnique(children);
      // If dedupe copied, both buffers are briefly alive.
      this.notePeak(children.byteLength + (level.buffer === children.buffer ? 0 : level.byteLength));
    }
  }

  private childCount(key: number, stage: StageName): number {
    const friendlyRemaining = popcount8(friendlyCodeOf(key) & 0xff);
    const enemyRemaining = popcount8(enemyCodeOf(key) & 0xff);
    if (stage === 'none') return friendlyRemaining * enemyRemaining;
    if (stage === 'select_attackers') return 4;
    const pairCount = (remaining: number) => {
      const eligible = this.k === null ? remaining : Math.min(this.k, remaining);
      return (eligible * (eligible - 1)) / 2;
    };
    return pairCount(friendlyRemaining) * pairCount(enemyRemaining);
  }

  private pushChildren(key: number, stage: StageName, out: Float64Array, offset: number): number {
    const friendly = decodeTeam(friendlyCodeOf(key));
    const enemy = decodeTeam(enemyCodeOf(key));

    if (stage === 'none') {
      const friendlyDefenders = maskIndices(friendly.mask);
      const enemyDefenders = maskIndices(enemy.mask);
      for (const myDefender of friendlyDefenders) {
        const friendlyCode = encodeTeam(
          friendly.mask & ~(1 << myDefender), myDefender, ROLE_NONE, ROLE_NONE);
        for (const enemyDefender of enemyDefenders) {
          out[offset++] = friendlyCode + encodeTeam(
            enemy.mask & ~(1 << enemyDefender), enemyDefender, ROLE_NONE, ROLE_NONE) * TEAM_SPAN;
        }
      }
    } else if (stage === 'select_defender') {
      const friendlyRemaining = maskIndices(friendly.mask);
      const enemyRemaining = maskIndices(enemy.mask);
      const friendlyPairs = attackerPairs(this.eligibleAttackers(
        FRIENDLY, friendlyRemaining, enemy.defender, enemyRemaining));
      const enemyPairs = attackerPairs(this.eligibleAttackers(
        ENEMY, enemyRemaining, friendly.defender, friendlyRemaining));

      for (let p = 0; p < friendlyPairs.length; p += 2) {
        const a = friendlyPairs[p];
        const b = friendlyPairs[p + 1];
        const friendlyCode = encodeTeam(
          friendly.mask & ~(1 << a) & ~(1 << b), friendly.defender,
          Math.min(a, b), Math.max(a, b));
        for (let q = 0; q < enemyPairs.length; q += 2) {
          const c = enemyPairs[q];
          const d = enemyPairs[q + 1];
          out[offset++] = friendlyCode + encodeTeam(
            enemy.mask & ~(1 << c) & ~(1 << d), enemy.defender,
            Math.min(c, d), Math.max(c, d)) * TEAM_SPAN;
        }
      }
    } else {
      // select_attackers → (skip the pass-through discard level) → the four
      // (n-2)-player none-states: each side's REFUSED attacker returns to its
      // pool (issue #32 semantics).
      for (const refusedFriendly of [friendly.attackerA, friendly.attackerB]) {
        const friendlyCode = encodeNoneTeam(friendly.mask | (1 << refusedFriendly));
        for (const refusedEnemy of [enemy.attackerA, enemy.attackerB]) {
          out[offset++] = friendlyCode + encodeNoneTeam(enemy.mask | (1 << refusedEnemy)) * TEAM_SPAN;
        }
      }
    }
    return offset;
  }

  // --- value-only backward induction (port of strategy_dictionaries) ---

  private induct(onProgress?: ProgressCallback): void {
    const order: [number, StageName][] = [];
    for (let levelN = this.endgameN; levelN <= this.n; levelN += 2) {
      order.push([levelN, 'select_attackers'], [levelN, 'select_defender'], [levelN, 'none']);
    }

    let total = 0;
    for (const [levelN, stage] of order) {
      total += this.keyArrays.get(`${levelN}:${stage}`)?.length ?? 0;
    }

    const scratch = new Float64Array(441); // <= 21x21 payoff matrix
    let processed = 0;
    let nextReport = 0;

    for (const [levelN, stage] of order) {
      const keys = this.keyArrays.get(`${levelN}:${stage}`);
      if (keys === undefined || keys.length === 0) continue;

      const childStore =
        stage === 'select_attackers' ? this.valueArrays.get(`${levelN - 2}:none`)
        : stage === 'select_defender' ? this.valueArrays.get(`${levelN}:select_attackers`)
        : this.valueArrays.get(`${levelN}:select_defender`);

      const values = new Float64Array(keys.length);
      for (let index = 0; index < keys.length; index++) {
        const key = keys[index];
        if (stage === 'select_attackers') {
          values[index] = this.discardGameValue(key, levelN, childStore);
        } else {
          values[index] = this.matrixGameValue(key, stage, childStore!, scratch);
        }

        if (onProgress && ++processed >= nextReport) {
          onProgress(processed / total, 'inducting');
          nextReport = processed + 16384;
        }
      }
      this.valueArrays.set(`${levelN}:${stage}`, { keys, values });
      this.allocStaticBytes += values.byteLength;
      this.notePeak(0);
    }
  }

  /** The 2×2 discard game decided at a select_attackers state (row = which
   * enemy attacker my side refuses, column = which of mine the enemy refuses)
   * — inlined, allocation-free port of games.build_discard_game. buildGame()
   * below carries the labelled copy for node queries; the conformance
   * fixtures pin both against the Python original. */
  private discardGameValue(key: number, levelN: number, childStore?: StageValues): number {
    const n = this.n;
    const friendlyCode = friendlyCodeOf(key);
    const enemyCode = enemyCodeOf(key);
    const fMask = friendlyCode & 0xff;
    const fDefender = (friendlyCode >> 8) & 0xf;
    const fA = (friendlyCode >> 12) & 0xf;
    const fB = (friendlyCode >> 16) & 0xf;
    const eMask = enemyCode & 0xff;
    const eDefender = (enemyCode >> 8) & 0xf;
    const eA = (enemyCode >> 12) & 0xf;
    const eB = (enemyCode >> 16) & 0xf;

    const fD_eA = this.best[fDefender * n + eA];
    const fD_eB = this.best[fDefender * n + eB];
    const fA_eD = this.worst[fA * n + eDefender];
    const fB_eD = this.worst[fB * n + eDefender];

    if (levelN === this.endgameN) {
      // Endgame: refused-vs-refused (and, at even sizes, last-vs-last) are
      // fixed neutral-value terms; no child game. At odd sizes the remaining
      // mask is empty — defender + 2 attackers is the whole team — so there
      // is no last-vs-last term.
      const lastTerm = fMask === 0 ? 0 : this.neutral[singleIndex(fMask) * n + singleIndex(eMask)];
      const AA = fD_eB + fB_eD + this.neutral[fA * n + eA] + lastTerm;
      const AB = fD_eB + fA_eD + this.neutral[fB * n + eA] + lastTerm;
      const BA = fD_eA + fB_eD + this.neutral[fA * n + eB] + lastTerm;
      const BB = fD_eA + fA_eD + this.neutral[fB * n + eB] + lastTerm;
      return value2x2(AA, AB, BA, BB);
    }

    const childKey = (refusedFriendly: number, refusedEnemy: number) => lookupValue(
      childStore!,
      encodeNoneTeam(fMask | (1 << refusedFriendly))
        + encodeNoneTeam(eMask | (1 << refusedEnemy)) * TEAM_SPAN);

    const AA = fD_eB + fB_eD + childKey(fA, eA);
    const AB = fD_eB + fA_eD + childKey(fB, eA);
    const BA = fD_eA + fB_eD + childKey(fA, eB);
    const BB = fD_eA + fA_eD + childKey(fB, eB);
    return value2x2(AA, AB, BA, BB);
  }

  /** Value of a none-stage (defender pick) or select_defender-stage (attacker
   * pick) game, matrix built into `scratch` from child stage values. */
  private matrixGameValue(
    key: number, stage: StageName, childStore: StageValues, scratch: Float64Array,
  ): number {
    const friendly = decodeTeam(friendlyCodeOf(key));
    const enemy = decodeTeam(enemyCodeOf(key));

    if (stage === 'none') {
      const friendlyDefenders = maskIndices(friendly.mask);
      const enemyDefenders = maskIndices(enemy.mask);
      const m = friendlyDefenders.length;
      const cols = enemyDefenders.length;
      for (let i = 0; i < m; i++) {
        const myDefender = friendlyDefenders[i];
        const friendlyCode = encodeTeam(
          friendly.mask & ~(1 << myDefender), myDefender, ROLE_NONE, ROLE_NONE);
        for (let j = 0; j < cols; j++) {
          const enemyDefender = enemyDefenders[j];
          scratch[i * cols + j] = lookupValue(childStore, friendlyCode + encodeTeam(
            enemy.mask & ~(1 << enemyDefender), enemyDefender, ROLE_NONE, ROLE_NONE) * TEAM_SPAN);
        }
      }
      return gameValue(scratch, m, cols);
    }

    // select_defender: rows/columns are attacker pairs.
    const friendlyRemaining = maskIndices(friendly.mask);
    const enemyRemaining = maskIndices(enemy.mask);
    const friendlyPairs = attackerPairs(this.eligibleAttackers(
      FRIENDLY, friendlyRemaining, enemy.defender, enemyRemaining));
    const enemyPairs = attackerPairs(this.eligibleAttackers(
      ENEMY, enemyRemaining, friendly.defender, friendlyRemaining));
    const m = friendlyPairs.length / 2;
    const cols = enemyPairs.length / 2;

    for (let i = 0; i < m; i++) {
      const a = friendlyPairs[2 * i];
      const b = friendlyPairs[2 * i + 1];
      const friendlyCode = encodeTeam(
        friendly.mask & ~(1 << a) & ~(1 << b), friendly.defender,
        Math.min(a, b), Math.max(a, b));
      for (let j = 0; j < cols; j++) {
        const c = enemyPairs[2 * j];
        const d = enemyPairs[2 * j + 1];
        scratch[i * cols + j] = lookupValue(childStore, friendlyCode + encodeTeam(
          enemy.mask & ~(1 << c) & ~(1 << d), enemy.defender,
          Math.min(c, d), Math.max(c, d)) * TEAM_SPAN);
      }
    }
    return gameValue(scratch, m, cols);
  }

  // --- draft-time lookups: recompute strategies/values on demand ---
  // (port of strategy_dictionaries.game_value / game_strategy)

  private knownValue(key: number): number | undefined {
    const friendlyCode = friendlyCodeOf(key);
    const store = this.valueArrays.get(`${teamN(friendlyCode)}:${teamStage(friendlyCode)}`);
    if (store !== undefined) {
      const value = tryLookupValue(store, key);
      if (value !== undefined) return value;
    }
    return this.extensionValues.get(key);
  }

  /** The value of any gamestate: precomputed if on the solved tree, else
   * solved on demand (recursively) and memoised — this is what lets the
   * trainer follow off-tree, non-k-restricted moves. */
  gamestateValue(friendlyTeam: TeamState, enemyTeam: TeamState): number {
    const key = encodeGamestate(teamCode(friendlyTeam), teamCode(enemyTeam));
    const known = this.knownValue(key);
    if (known !== undefined) return known;

    const game = this.buildGame(friendlyTeam, enemyTeam);
    const value = gameValue(game.a, game.m, game.n);
    this.extensionValues.set(key, value);
    return value;
  }

  /** Build the labelled payoff matrix for the game decided at a gamestate,
   * reading child values through gamestateValue (recursing off-tree). Port of
   * games.build_game. */
  buildGame(friendly: TeamState, enemy: TeamState): BuiltGame {
    const stage = teamStage(teamCode(friendly));
    if (stage === 'none') return this.buildDefenderGame(friendly, enemy);
    if (stage === 'select_defender') return this.buildAttackersGame(friendly, enemy);
    return this.buildDiscardGame(friendly, enemy);
  }

  private buildDefenderGame(friendly: TeamState, enemy: TeamState): BuiltGame {
    const friendlyDefenders = maskIndices(friendly.mask);
    const enemyDefenders = maskIndices(enemy.mask);
    const m = friendlyDefenders.length;
    const n = enemyDefenders.length;
    const a = new Float64Array(m * n);
    for (let i = 0; i < m; i++) {
      const myDefender = friendlyDefenders[i];
      const friendlyChild: TeamState = {
        mask: friendly.mask & ~(1 << myDefender),
        defender: myDefender, attackerA: ROLE_NONE, attackerB: ROLE_NONE,
      };
      for (let j = 0; j < n; j++) {
        const enemyDefender = enemyDefenders[j];
        a[i * n + j] = this.gamestateValue(friendlyChild, {
          mask: enemy.mask & ~(1 << enemyDefender),
          defender: enemyDefender, attackerA: ROLE_NONE, attackerB: ROLE_NONE,
        });
      }
    }
    return { a, m, n, rowOptions: friendlyDefenders, colOptions: enemyDefenders };
  }

  private buildAttackersGame(friendly: TeamState, enemy: TeamState): BuiltGame {
    const friendlyRemaining = maskIndices(friendly.mask);
    const enemyRemaining = maskIndices(enemy.mask);
    const friendlyPairs = attackerPairs(this.eligibleAttackers(
      FRIENDLY, friendlyRemaining, enemy.defender, enemyRemaining));
    const enemyPairs = attackerPairs(this.eligibleAttackers(
      ENEMY, enemyRemaining, friendly.defender, friendlyRemaining));
    const m = friendlyPairs.length / 2;
    const n = enemyPairs.length / 2;
    const a = new Float64Array(m * n);
    const rowOptions: [number, number][] = [];
    const colOptions: [number, number][] = [];

    for (let i = 0; i < m; i++) {
      const attackerA = friendlyPairs[2 * i];
      const attackerB = friendlyPairs[2 * i + 1];
      rowOptions.push([Math.min(attackerA, attackerB), Math.max(attackerA, attackerB)]);
    }
    for (let j = 0; j < n; j++) {
      const attackerA = enemyPairs[2 * j];
      const attackerB = enemyPairs[2 * j + 1];
      colOptions.push([Math.min(attackerA, attackerB), Math.max(attackerA, attackerB)]);
    }

    for (let i = 0; i < m; i++) {
      const [fA, fB] = rowOptions[i] as [number, number];
      const friendlyChild: TeamState = {
        mask: friendly.mask & ~(1 << fA) & ~(1 << fB),
        defender: friendly.defender, attackerA: fA, attackerB: fB,
      };
      for (let j = 0; j < n; j++) {
        const [eA, eB] = colOptions[j] as [number, number];
        a[i * n + j] = this.gamestateValue(friendlyChild, {
          mask: enemy.mask & ~(1 << eA) & ~(1 << eB),
          defender: enemy.defender, attackerA: eA, attackerB: eB,
        });
      }
    }
    return { a, m, n, rowOptions, colOptions };
  }

  /** Labelled discard game (row option = the refused ENEMY attacker, column
   * option = the refused FRIENDLY attacker — matching games.build_discard_game
   * which returns [e_attackers] as the friendly options). */
  private buildDiscardGame(friendly: TeamState, enemy: TeamState): BuiltGame {
    const n = this.n;
    const { defender: fDefender, attackerA: fA, attackerB: fB } = friendly;
    const { defender: eDefender, attackerA: eA, attackerB: eB } = enemy;

    const fD_eA = this.best[fDefender * n + eA];
    const fD_eB = this.best[fDefender * n + eB];
    const fA_eD = this.worst[fA * n + eDefender];
    const fB_eD = this.worst[fB * n + eDefender];

    const a = new Float64Array(4);
    if (popcount8(friendly.mask) + 3 === this.endgameN) {
      const lastTerm = friendly.mask === 0
        ? 0 : this.neutral[singleIndex(friendly.mask) * n + singleIndex(enemy.mask)];
      a[0] = fD_eB + fB_eD + this.neutral[fA * n + eA] + lastTerm;
      a[1] = fD_eB + fA_eD + this.neutral[fB * n + eA] + lastTerm;
      a[2] = fD_eA + fB_eD + this.neutral[fA * n + eB] + lastTerm;
      a[3] = fD_eA + fA_eD + this.neutral[fB * n + eB] + lastTerm;
    } else {
      const child = (refusedFriendly: number, refusedEnemy: number) => this.gamestateValue(
        { mask: friendly.mask | (1 << refusedFriendly), defender: ROLE_NONE, attackerA: ROLE_NONE, attackerB: ROLE_NONE },
        { mask: enemy.mask | (1 << refusedEnemy), defender: ROLE_NONE, attackerA: ROLE_NONE, attackerB: ROLE_NONE });
      a[0] = fD_eB + fB_eD + child(fA, eA);
      a[1] = fD_eB + fA_eD + child(fB, eA);
      a[2] = fD_eA + fB_eD + child(fA, eB);
      a[3] = fD_eA + fA_eD + child(fB, eB);
    }
    return { a, m: 2, n: 2, rowOptions: [eA, eB], colOptions: [fA, fB] };
  }

  // --- the trainer-facing node query (§3.3 NodeResult) ---

  /** Walk `path` from the root and return the NodeResult for the reached
   * gamestate. Throws on invalid moves. */
  nodeResult(path: Move[]): NodeResult {
    const full = (1 << this.n) - 1;
    let friendly: TeamState = { mask: full, defender: ROLE_NONE, attackerA: ROLE_NONE, attackerB: ROLE_NONE };
    let enemy: TeamState = { mask: full, defender: ROLE_NONE, attackerA: ROLE_NONE, attackerB: ROLE_NONE };
    let done = false;

    const moveNameOf = { none: 'defender', select_defender: 'attackers', select_attackers: 'refusal' } as const;

    for (const move of path) {
      if (done) throw new Error('Draft already complete; no moves can follow.');
      const stage = teamStage(teamCode(friendly));
      const expectedMove = moveNameOf[stage];
      if (move.stage !== expectedMove) {
        throw new Error(`Expected a '${expectedMove}' move, got '${move.stage}'.`);
      }

      if (move.stage === 'defender') {
        friendly = applyDefender(friendly, move.my, 'my');
        enemy = applyDefender(enemy, move.enemy, 'enemy');
      } else if (move.stage === 'attackers') {
        friendly = applyAttackers(friendly, move.my, 'my');
        enemy = applyAttackers(enemy, move.enemy, 'enemy');
      } else {
        // move.my = the ENEMY attacker my side refuses; move.enemy = the
        // FRIENDLY attacker the enemy refuses. Both return to their pools.
        const refusedEnemy = requireAttacker(enemy, move.my, 'my refusal');
        const refusedFriendly = requireAttacker(friendly, move.enemy, "enemy's refusal");
        if (popcount8(friendly.mask) + 3 === this.endgameN) {
          done = true;
        } else {
          friendly = { mask: friendly.mask | (1 << refusedFriendly), defender: ROLE_NONE, attackerA: ROLE_NONE, attackerB: ROLE_NONE };
          enemy = { mask: enemy.mask | (1 << refusedEnemy), defender: ROLE_NONE, attackerA: ROLE_NONE, attackerB: ROLE_NONE };
        }
      }
    }

    const currentN = teamN(teamCode(friendly));
    // Sound for every n <= 8, both parities: rounds peak at 3 (8→6→4, 7→5→3).
    const round = (this.n - currentN) / 2 + 1 as 1 | 2 | 3;
    if (done) {
      // `done` is set at the endgame-round refusal, so the states above still
      // sit at the endgame level and `round` is already the final round.
      return { stage: 'done', side: 'simultaneous', round, choices: [], why: null };
    }

    const game = this.buildGame(friendly, enemy);
    const solution = solveGame(game.a, game.m, game.n);
    const stage = teamStage(teamCode(friendly));
    const nodeStage = stage === 'none' ? 'defender' : stage === 'select_defender' ? 'attackers' : 'refusal';

    // Row labels are my choices. For defender/attackers they name my players;
    // for refusal the row options are ENEMY attackers (I refuse one of theirs).
    const rowNameOf = (option: number | [number, number]): string | [string, string] =>
      typeof option === 'number'
        ? (nodeStage === 'refusal' ? this.enemyNames[option] : this.myNames[option])
        : [this.myNames[option[0]], this.myNames[option[1]]];
    const colNameOf = (option: number | [number, number]): string | [string, string] =>
      typeof option === 'number'
        ? (nodeStage === 'refusal' ? this.myNames[option] : this.enemyNames[option])
        : [this.enemyNames[option[0]], this.enemyNames[option[1]]];

    const choices: NodeChoice[] = game.rowOptions.map((option, i) => {
      let ev = 0;
      for (let j = 0; j < game.n; j++) ev += game.a[i * game.n + j] * solution.col[j];
      return { id: option, name: rowNameOf(option), prob: solution.row[i], ev };
    });

    return {
      stage: nodeStage,
      side: 'simultaneous',
      round,
      choices,
      why: {
        rowLabels: game.rowOptions.map((option) => joinName(rowNameOf(option))),
        colLabels: game.colOptions.map((option) => joinName(colNameOf(option))),
        payoff: Array.from({ length: game.m }, (_, i) =>
          Array.from({ length: game.n }, (_, j) => game.a[i * game.n + j])),
        myStrategy: solution.row,
        enStrategy: solution.col,
      },
    };
  }

  /** Direct labelled solution for a gamestate described by team states —
   * used by the conformance suite to compare against Python sample nodes. */
  solveNode(friendly: TeamState, enemy: TeamState): { game: BuiltGame; solution: GameSolution } {
    const game = this.buildGame(friendly, enemy);
    return { game, solution: solveGame(game.a, game.m, game.n) };
  }
}

export type { TeamState, BuiltGame };

function joinName(name: string | [string, string]): string {
  return typeof name === 'string' ? name : `${name[0]} + ${name[1]}`;
}

function applyDefender(team: TeamState, defender: number, label: string): TeamState {
  if ((team.mask & (1 << defender)) === 0) {
    throw new Error(`Invalid ${label} defender: player ${defender} is not available.`);
  }
  return { mask: team.mask & ~(1 << defender), defender, attackerA: ROLE_NONE, attackerB: ROLE_NONE };
}

function applyAttackers(team: TeamState, pair: [number, number], label: string): TeamState {
  const [a, b] = pair;
  if (a === b || (team.mask & (1 << a)) === 0 || (team.mask & (1 << b)) === 0) {
    throw new Error(`Invalid ${label} attackers: [${a}, ${b}] not available.`);
  }
  return {
    mask: team.mask & ~(1 << a) & ~(1 << b),
    defender: team.defender,
    attackerA: Math.min(a, b),
    attackerB: Math.max(a, b),
  };
}

function requireAttacker(team: TeamState, attacker: number, label: string): number {
  if (attacker !== team.attackerA && attacker !== team.attackerB) {
    throw new Error(`Invalid ${label}: player ${attacker} is not one of the sent attackers.`);
  }
  return attacker;
}
