import { useEffect, useMemo, useState } from 'react';
import { AboutModal } from './components/AboutModal';
import { DraftTrainer } from './components/DraftTrainer';
import { MatrixEditor } from './components/MatrixEditor';
import { SolveView } from './components/SolveView';
import { blank, toEngineMatrix } from './model/matrix';
import type { EditorMatrix } from './model/matrix';
import { loadState, saveState } from './model/storage';
import type { AppState, Settings } from './model/storage';
import { validateMatrix } from './model/validation';
import { useSolve } from './worker/useSolve';

type Screen = 'editor' | 'solve' | 'trainer';

// The worker defaults the neutral-game weight to 0.5 (§4/§7); the trainer's
// pairing values must use the same to match the engine's totals.
const NEUTRAL_WEIGHT = 0.5;

export function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [screen, setScreen] = useState<Screen>('editor');
  const [showAbout, setShowAbout] = useState(false);
  const solve = useSolve();

  // Persist the whole blob whenever it changes (§4.2 auto-save).
  useEffect(() => saveState(state), [state]);

  const matrix = useMemo(() => state.current ?? blank(8), [state.current]);
  const { settings, saves } = state;
  const solvable = useMemo(() => validateMatrix(matrix).ok, [matrix]);
  const engineMatrix = useMemo(() => {
    try {
      return solvable ? toEngineMatrix(matrix) : null;
    } catch {
      return null;
    }
  }, [matrix, solvable]);

  // A matrix edit invalidates any solved result (§3: reset on matrix change).
  useEffect(() => {
    if (solve.status !== 'idle') solve.reset();
    // Only react to matrix identity; solve is stable enough for this guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrix]);

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

  const goSolve = () => setScreen('solve');
  const startTraining = () => {
    if (!solvable) return;
    // The trainer runs on the exact equilibrium; re-solve if the current
    // result is a k-preview (or missing).
    if (!(solve.status === 'done' && solve.solvedK === null)) solve.solve(matrix, null);
    setScreen('trainer');
  };

  return (
    <div className={settings.cb ? 'app cb' : 'app'}>
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
          <button
            className={screen === 'solve' ? 'tab active' : 'tab'}
            disabled={!solvable}
            title={solvable ? undefined : 'Complete the matrix first'}
            onClick={goSolve}
          >
            Solver
          </button>
          <button
            className={screen === 'trainer' ? 'tab active' : 'tab'}
            disabled={!solvable}
            title={solvable ? undefined : 'Complete the matrix first'}
            onClick={startTraining}
          >
            Trainer
          </button>
        </nav>
        <span className="spacer" />
        <button
          className="pill button"
          onClick={() => setShowAbout(true)}
          title="What this app is, and how your data is handled"
        >
          <span className="dot" /> Local-only <span className="info-icon" aria-hidden="true">ⓘ</span>
        </button>
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
            onSolve={solvable ? goSolve : undefined}
          />
        )}
        {screen === 'solve' && (
          <SolveView
            myTeam={matrix.myTeam}
            enemyTeam={matrix.enemyTeam}
            n={matrix.n}
            canRun={solvable}
            solve={solve}
            onRun={() => solve.solve(matrix, null)}
            onTrain={solvable ? startTraining : undefined}
          />
        )}
        {screen === 'trainer' && engineMatrix && (
          <DraftTrainer
            matrix={engineMatrix}
            myTeam={matrix.myTeam}
            enemyTeam={matrix.enemyTeam}
            neutralWeight={NEUTRAL_WEIGHT}
            solve={solve}
            onEditMatrix={() => setScreen('editor')}
          />
        )}
      </main>

      <footer className="app-footer">
        Runs entirely in your browser — your matrix never leaves the tab.
      </footer>

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </div>
  );
}
