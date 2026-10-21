interface RatingModeToggleProps {
  simpleMode: boolean;
  onChange: (simpleMode: boolean) => void;
  /** Locks both options (a practice draft is live, or a solve is running). */
  disabled?: boolean;
  /** Which modes the matrix validates in; an unusable one is greyed out with a
   * tooltip. Defaults to both — the Matrix screen, where cells get fixed. */
  canUse?: { simple: boolean; byMap: boolean };
}

const BOTH = { simple: true, byMap: true };

/** The Single rating / By map switch for the app-wide rating mode — shown on
 * the Matrix screen, the Solver start screen and the Trainer intro. */
export function RatingModeToggle({ simpleMode, onChange, disabled = false, canUse = BOTH }: RatingModeToggleProps) {
  return (
    <div className="segmented" role="group" aria-label="Rating mode">
      <button
        className={simpleMode ? 'on' : ''}
        aria-pressed={simpleMode}
        disabled={disabled || !canUse.simple}
        title={canUse.simple ? undefined : 'Fill in the single ratings on the Matrix screen first'}
        onClick={() => onChange(true)}
      >
        Single rating
      </button>
      <button
        className={!simpleMode ? 'on' : ''}
        aria-pressed={!simpleMode}
        disabled={disabled || !canUse.byMap}
        title={canUse.byMap ? undefined : 'Fill in the map ratings on the Matrix screen first'}
        onClick={() => onChange(false)}
      >
        By map
      </button>
    </div>
  );
}
