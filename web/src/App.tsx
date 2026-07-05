import { useEffect, useMemo, useState } from 'react';
import { MatrixEditor } from './components/MatrixEditor';
import { blank } from './model/matrix';
import type { EditorMatrix } from './model/matrix';
import { loadState, saveState } from './model/storage';
import type { AppState, Settings } from './model/storage';

type Screen = 'editor' | 'solve' | 'trainer' | 'summary';

export function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [screen, setScreen] = useState<Screen>('editor');

  // Persist the whole blob whenever it changes (§4.2 auto-save).
  useEffect(() => saveState(state), [state]);

  const matrix = useMemo(() => state.current ?? blank(8), [state.current]);
  const { settings, saves } = state;

  const setMatrix = (m: EditorMatrix) => setState((s) => ({ ...s, current: m }));
  const setSettings = (next: Settings) => setState((s) => ({ ...s, settings: next }));
  const saveAs = (name: string) => setState((s) => ({ ...s, saves: { ...s.saves, [name]: matrix } }));
  const loadSave = (name: string) => {
    const saved = saves[name];
    if (saved) setMatrix(saved);
  };
  const deleteSave = (name: string) =>
    setState((s) => {
      const rest = { ...s.saves };
      delete rest[name];
      return { ...s, saves: rest };
    });

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">WTC</span>
          <span className="brand-name">Draft Trainer</span>
          {(matrix.myTeam || matrix.enemyTeam) && (
            <span className="matchup-chip">
              <span className="mine">{matrix.myTeam || 'You'}</span>
              <span className="vs"> vs </span>
              <span className="enemy">{matrix.enemyTeam || 'Opponent'}</span>
            </span>
          )}
        </div>
        <nav className="screens">
          <button className={screen === 'editor' ? 'tab active' : 'tab'} onClick={() => setScreen('editor')}>
            Matrix
          </button>
          <button className="tab" disabled title="Arrives with issue #20">Solve</button>
          <button className="tab" disabled title="Arrives with issue #21">Trainer</button>
        </nav>
        <span className="spacer" />
        <span className="pill" title="Everything runs in your browser; nothing is uploaded.">
          <span className="dot" /> Local-only
        </span>
        <button
          className={settings.cb ? 'pill button' : 'pill button off'}
          onClick={() => setSettings({ ...settings, cb: !settings.cb })}
          title="Toggle a colourblind-safe palette"
        >
          <span className="dot" /> Colorblind-safe: {settings.cb ? 'on' : 'off'}
        </button>
      </header>

      <main className="app-main">
        {screen === 'editor' && (
          <MatrixEditor
            matrix={matrix}
            settings={settings}
            saves={saves}
            onMatrixChange={setMatrix}
            onSettingsChange={setSettings}
            onSaveAs={saveAs}
            onLoadSave={loadSave}
            onDeleteSave={deleteSave}
          />
        )}
      </main>

      <footer className="app-footer">
        Runs entirely in your browser — your matrix never leaves the tab.{' '}
        <a href={`${import.meta.env.BASE_URL}bench.html`}>Engine benchmark →</a>
      </footer>
    </div>
  );
}
