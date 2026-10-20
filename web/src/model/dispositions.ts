/** The five force dispositions a player can bring, stored lowercase on a
 * matrix ('' = not chosen). Display-only notes for the captain: the solver
 * ignores them. */
export const DISPOSITIONS = ['purge', 'hold', 'disrupt', 'priority', 'recon'] as const;

export type Disposition = '' | typeof DISPOSITIONS[number];

/** The pill text shown in the matrix headers. */
export const DISPOSITION_LABELS: Record<typeof DISPOSITIONS[number], string> = {
  purge: 'PURGE',
  hold: 'HOLD',
  disrupt: 'DISRUPT',
  priority: 'PRIORITY',
  recon: 'RECON',
};

const KNOWN: ReadonlySet<string> = new Set(DISPOSITIONS);

/** Normalise loaded data: a known disposition passes through; anything else
 * (absent in older saves, hand-edited, unknown) becomes unset. */
export function toDisposition(raw: unknown): Disposition {
  return typeof raw === 'string' && KNOWN.has(raw) ? (raw as Disposition) : '';
}
