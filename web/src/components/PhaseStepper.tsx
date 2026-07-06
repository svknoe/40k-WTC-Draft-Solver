interface PhaseStepperProps {
  stage: 'defender' | 'attackers' | 'refusal';
}

const STEPS = [
  { key: 'defender', label: 'Defenders' },
  { key: 'attackers', label: 'Attackers' },
  { key: 'refusal', label: 'Pairing' },
] as const;

/** The round's three steps as a segmented indicator (docs/design-mockup.html
 * "Trainer": Defenders | Attackers | Pairing). The 'refusal' key keeps the
 * engine's name; the label is user-facing (people think in pairings). Active
 * stage is `.on`. */
export function PhaseStepper({ stage }: PhaseStepperProps) {
  return (
    <div className="stepper segmented" role="list" aria-label="Draft phase">
      {STEPS.map((step) => (
        <span key={step.key} role="listitem" aria-current={step.key === stage} className={step.key === stage ? 'on' : ''}>
          {step.label}
        </span>
      ))}
    </div>
  );
}
