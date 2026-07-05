/** The "Local-only ⓘ" explainer (docs/design-mockup.html): what the app is and
 * how data is handled. Opened from the header pill. */
export function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="About WTC Draft Trainer">
        <div className="about-head">
          <div>
            <h2>WTC Draft Trainer</h2>
            <p className="muted">
              Build your matchup matrix, solve the pairing game, and rehearse the captain's draft
              against a bot before the event.
            </p>
          </div>
          <button className="modal-close" aria-label="Close" onClick={onClose}>✕</button>
        </div>

        <div className="about-section">
          <h3>Everything stays on your computer</h3>
          <p className="muted">
            Your matrices and practice drafts are a competitive edge, so they never leave this
            device. They're saved only in this browser — no account, no server, no sync. Use
            Export JSON to share prep with teammates on your own terms.
          </p>
        </div>

        <div className="about-section">
          <h3>Built for practice, not for live events</h3>
          <p className="muted">
            This is a training tool. Coaching hints automatically switch off during official WTC
            dates, so the app can't be used to gain an edge at the table. They come back on their
            own once the event is over.
          </p>
        </div>

        <div className="modal-actions">
          <button className="primary" onClick={onClose}>Got it</button>
        </div>
      </div>
    </div>
  );
}
