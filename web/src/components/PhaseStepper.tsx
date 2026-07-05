interface PhaseStepperProps {
  stage: 'defender' | 'attackers' | 'refusal';
}

const STEPS = [
  { key: 'defender', label: 'Defenders' },
  { key: 'attackers', label: 'Attackers' },
  { key: 'refusal', label: 'Refusal' },
] as const;

/** The round's three steps as a segmented indicator (docs/design-mockup.html
 * "Trainer": Defenders | Attackers | Refusal). The current stage is `.on`. */
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
