/**
 * Packed-integer encoding of team permutations and gamestates for the TS
 * engine (issue #17). Mirrors drafter/common/packing.py with one deliberate
 * difference: JS numbers only hold 53 safe integer bits, so the gamestate key
 * is repacked to 40 bits (two 20-bit team codes) instead of Python's two
 * 24-bit codes, keeping keys on V8's plain-number fast paths (no BigInt).
 *
 * A team code packs into 20 bits:
 *
 *   bits  0..7  : remaining-players bitmask (bit i set => player i remains)
 *   bits  8..11 : defender    (ROLE_NONE = 0xF when unset)
 *   bits 12..15 : attacker_A
 *   bits 16..19 : attacker_B
 *
 * Python's fourth role nibble (discarded_attacker) is dropped: the solver
 * never stores discard-stage gamestates (their game is decided at the parent
 * select_attackers state), so keys only ever encode the none /
 * select_defender / select_attackers stages. In-flight discard decisions live
 * in decoded DraftState objects, never in keys.
 *
 * A gamestate key is friendly + enemy * 2^20 — at most 40 bits, exact in a
 * float64. The low 20 bits are safe for 32-bit bitwise ops; the full key is
 * split with division (bitwise ops would truncate it).
 */

export const ROLE_NONE = 0xf;

const TEAM_BITS = 20;
export const TEAM_SPAN = 1 << TEAM_BITS;

/** Team code with no roles set (all-role nibbles = ROLE_NONE). */
const NO_ROLES = (ROLE_NONE << 8) | (ROLE_NONE << 12) | (ROLE_NONE << 16);

export function encodeTeam(
  remainingMask: number, defender: number, attackerA: number, attackerB: number,
): number {
  return remainingMask | (defender << 8) | (attackerA << 12) | (attackerB << 16);
}

export function encodeNoneTeam(remainingMask: number): number {
  return remainingMask | NO_ROLES;
}

export function teamMask(code: number): number { return code & 0xff; }
export function teamDefender(code: number): number { return (code >> 8) & 0xf; }
export function teamAttackerA(code: number): number { return (code >> 12) & 0xf; }
export function teamAttackerB(code: number): number { return (code >> 16) & 0xf; }

export function encodeGamestate(friendlyCode: number, enemyCode: number): number {
  return friendlyCode + enemyCode * TEAM_SPAN;
}

export function friendlyCodeOf(key: number): number {
  return key - Math.floor(key / TEAM_SPAN) * TEAM_SPAN;
}

export function enemyCodeOf(key: number): number {
  return Math.floor(key / TEAM_SPAN);
}

const POPCOUNT8 = new Uint8Array(256);
for (let i = 0; i < 256; i++) POPCOUNT8[i] = (i & 1) + POPCOUNT8[i >> 1];

export function popcount8(mask: number): number {
  return POPCOUNT8[mask];
}

/** Ascending indices of the set bits — reproduces the Python engine's
 * "remaining players sorted" canonicalisation. */
export function maskIndices(mask: number): number[] {
  const indices: number[] = [];
  for (let i = 0; i < 8; i++) if (mask & (1 << i)) indices.push(i);
  return indices;
}

/** Players on this team: popcount(remaining) + roles set (mirrors
 * packing.team_permutation_n). */
export function teamN(code: number): number {
  let n = POPCOUNT8[code & 0xff];
  if (teamDefender(code) !== ROLE_NONE) n += 1;
  if (teamAttackerA(code) !== ROLE_NONE) n += 1;
  if (teamAttackerB(code) !== ROLE_NONE) n += 1;
  return n;
}

export type StageName = 'none' | 'select_defender' | 'select_attackers';

export function teamStage(code: number): StageName {
  if (teamAttackerA(code) !== ROLE_NONE) return 'select_attackers';
  if (teamDefender(code) !== ROLE_NONE) return 'select_defender';
  return 'none';
}
