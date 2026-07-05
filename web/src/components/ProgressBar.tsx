interface ProgressBarProps {
  frac: number;
  label?: string;
}

export function ProgressBar({ frac, label }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, frac * 100));
  return (
    <div className="progress-wrap">
      <div
        className="progress"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      {label && <div className="progress-label">{label}</div>}
    </div>
  );
}
