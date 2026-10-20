/** The 21-step matchup palette (one colour per whole 0-20 score). The colours
 * themselves live in theme.css as --pt-<k> / --pt-ink-<k> and the .pt-<k>
 * classes, so the colour-blind toggle can swap them in one place. */

/** The palette step for a 0-20 value: rounded to the nearest whole score
 * (.5 up) and clamped to 0..20. A map average like 11.3 shows as step 11. */
export function pointStep(value: number): number {
  return Math.min(20, Math.max(0, Math.round(value)));
}

/** The CSS class that fills an element with a value's palette colour + ink. */
export function pointClass(value: number): string {
  return `pt-${pointStep(value)}`;
}
