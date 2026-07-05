import { useState } from 'react';

type Screen = 'editor' | 'solve' | 'trainer' | 'summary';

export function App() {
  const [screen, setScreen] = useState<Screen>('editor');

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">WTC</span>
          <span className="brand-name">Draft Trainer</span>
        </div>
        <nav className="screens">
          <button
            className={screen === 'editor' ? 'tab active' : 'tab'}
            onClick={() => setScreen('editor')}
          >
            Matrix editor
          </button>
          <button className="tab" disabled title="Arrives with issue #20">
            Solve view
          </button>
          <button className="tab" disabled title="Arrives with issue #21">
            Draft trainer
          </button>
        </nav>
      </header>

      <main className="app-main">
        {screen === 'editor' && <p className="placeholder">Matrix editor loads here.</p>}
      </main>

      <footer className="app-footer">
        Runs entirely in your browser — your matrix never leaves the tab.{' '}
        <a href="/bench.html">Engine benchmark →</a>
      </footer>
    </div>
  );
}
