import { useRef, useState, type ChangeEvent } from 'react';
import { exportJson, importJson } from '../model/exchange';
import type { EditorCell, EditorMatrix, MatrixSize } from '../model/matrix';
import { cleared, randomized, resize, transpose } from '../model/matrix';
import { parsePaste } from '../model/paste';
import type { Settings } from '../model/storage';
import { validateMatrix } from '../model/validation';
import { Grid } from './Grid';
import { PasteModal } from './PasteModal';
import './editor.css';

interface MatrixEditorProps {
  matrix: EditorMatrix;
  settings: Settings;
  saves: Record<string, EditorMatrix>;
  onMatrixChange: (m: EditorMatrix) => void;
  onSettingsChange: (s: Settings) => void;
  onSaveAs: (name: string) => void;
  onLoadSave: (name: string) => void;
  onDeleteSave: (name: string) => void;
  /** Provided once the solve view exists (#20); undefined disables the CTA. */
  onSolve?: () => void;
  /** True while a practice draft depends on this matrix: the editor freezes so
   * its numbers can't drift out from under the running draft/solver. */
  locked?: boolean;
  /** Discards the in-progress draft (immediately, no confirm) to re-enable
   * editing. Only rendered/used while `locked`. */
  onDiscardDraft?: () => void;
}

function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function MatrixEditor({
  matrix, settings, saves, onMatrixChange, onSettingsChange,
  onSaveAs, onLoadSave, onDeleteSave, onSolve, locked = false, onDiscardDraft,
}: MatrixEditorProps) {
  const [saveName, setSaveName] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const validation = validateMatrix(matrix);
  const update = (partial: Partial<EditorMatrix>) => onMatrixChange({ ...matrix, ...partial });

  const setMyName = (i: number, name: string) => {
    const names = [...matrix.myNames];
    names[i] = name;
    update({ myNames: names });
  };
  const setEnemyName = (j: number, name: string) => {
    const names = [...matrix.enemyNames];
    names[j] = name;
    update({ enemyNames: names });
  };
  const setCell = (i: number, j: number, cell: EditorCell) => {
    const cells = matrix.cells.map((row) => row.slice());
    cells[i][j] = cell;
    update({ cells });
  };

  const doExport = () => {
    const name = `${matrix.myTeam || 'my-team'}-vs-${matrix.enemyTeam || 'opponent'}`
      .trim().replace(/\s+/g, '-').toLowerCase();
    download(`${name}.json`, exportJson(matrix));
  };
  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      onMatrixChange(importJson(await file.text()));
      setImportError(null);
    } catch (error) {
      setImportError((error as Error).message);
    }
  };
  const applyPaste = (text: string) => {
    onMatrixChange({ ...matrix, cells: parsePaste(text, matrix.n) });
    setPasteOpen(false);
  };

  const savedNames = Object.keys(saves);

  return (
    <>
      {locked && (
        <div className="draft-lock">
          <span className="draft-lock-dot" aria-hidden="true" />
          <span className="draft-lock-text">
            A practice draft is in progress — matrix editing is paused so your draft and
            solver stay consistent with the numbers you drafted on.
          </span>
          <button className="draft-lock-discard" onClick={onDiscardDraft}>
            Discard draft to edit
          </button>
        </div>
      )}
      <div className="editor">
      <aside className="editor-sidebar">
        <div>
          <div className="section-head">Saved opponents</div>
          {savedNames.length === 0 ? (
            <div className="card muted">No saved opponents yet. Name this matchup and hit Save.</div>
          ) : (
            <div className="saved-list">
              {savedNames.map((name) => (
                <div className="saved-row" key={name}>
                  <button className="load" disabled={locked} onClick={() => onLoadSave(name)}>{name}</button>
                  <button className="del" disabled={locked} title={`Delete ${name}`} onClick={() => onDeleteSave(name)}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="row">
          <input
            placeholder="Save as…"
            aria-label="Save matchup as"
            value={saveName}
            disabled={locked}
            onChange={(e) => setSaveName(e.target.value)}
          />
          <button
            className="primary"
            disabled={locked || !saveName.trim()}
            onClick={() => { onSaveAs(saveName.trim()); setSaveName(''); }}
          >
            Save
          </button>
        </div>

        <div className="row">
          <button onClick={doExport}>Export JSON</button>
          <button disabled={locked} onClick={() => fileRef.current?.click()}>Import JSON</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden-file"
            aria-label="Import matrix JSON"
            onChange={onFile}
          />
        </div>

        <button disabled={locked} onClick={() => setPasteOpen(true)}>Paste from spreadsheet…</button>
        {importError && <div className="errors">{importError}</div>}

        <p className="privacy">
          Matrices stay in this browser — never uploaded to any server. Export a JSON file to share
          prep with teammates on your terms.
        </p>
      </aside>

      <div className={locked ? 'editor-main locked' : 'editor-main'}>
        <div className="matchup">
          <input
            className="team-name mine"
            placeholder="Your team"
            aria-label="Your team name"
            value={matrix.myTeam}
            readOnly={locked}
            onChange={(e) => update({ myTeam: e.target.value })}
          />
          <label>rows · my team</label>
          <span className="vs">vs</span>
          <input
            className="team-name enemy"
            placeholder="Opponent"
            aria-label="Opponent team name"
            value={matrix.enemyTeam}
            readOnly={locked}
            onChange={(e) => update({ enemyTeam: e.target.value })}
          />
          <label>columns · opponent</label>
        </div>

        <div className="controls">
          <label>
            Team size{' '}
            <select
              value={matrix.n}
              aria-label="Team size"
              disabled={locked}
              onChange={(e) => onMatrixChange(resize(matrix, Number(e.target.value) as MatrixSize))}
            >
              {[3, 4, 5, 6, 7, 8].map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
          <button
            disabled={locked}
            title="Reset names and set every matchup to an even 10"
            onClick={() => onMatrixChange(cleared(matrix.n))}
          >
            Clear
          </button>
          <button
            disabled={locked}
            title="Fill every matchup with random 0-20 scores"
            onClick={() => onMatrixChange(randomized(matrix))}
          >
            Random
          </button>
          <span className="spacer" />
          <div className="segmented" role="group" aria-label="Rating mode">
            <button className={settings.simpleMode ? 'on' : ''} disabled={locked} onClick={() => onSettingsChange({ ...settings, simpleMode: true })}>
              Single rating
            </button>
            <button className={!settings.simpleMode ? 'on' : ''} disabled={locked} onClick={() => onSettingsChange({ ...settings, simpleMode: false })}>
              Best / worst map
            </button>
          </div>
          <button
            onClick={() => { if (validation.ok) onMatrixChange(transpose(matrix)); }}
            disabled={locked || !validation.ok}
            title={validation.ok ? 'Swap which side you captain — transposes the matrix and team names' : 'Fix invalid cells before swapping'}
          >
            ⇄ Swap sides
          </button>
        </div>

        <Grid
          matrix={matrix}
          simpleMode={settings.simpleMode}
          cellErrors={validation.cellErrors}
          readOnly={locked}
          onCellChange={setCell}
          onMyName={setMyName}
          onEnemyName={setEnemyName}
        />

        <div className="legend">
          <span>Each cell: my expected score, 0–20 · 10 = even game</span>
          <span className="swatch"><span className="chip worst" /> worst ≤ 4</span>
          <span className="swatch"><span className="chip bad" /> bad 5–8</span>
          <span className="swatch"><span className="chip okay" /> okay 9–11</span>
          <span className="swatch"><span className="chip good" /> good 12–15</span>
          <span className="swatch"><span className="chip best" /> best 16+</span>
        </div>

        {validation.globalErrors.length > 0 && (
          <div className="errors">
            <strong>Fix before solving:</strong>
            <ul>{validation.globalErrors.slice(0, 6).map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        )}

        <div className="solve-bar">
          <button
            className="primary"
            disabled={!validation.ok || !onSolve || locked}
            onClick={onSolve}
            title={onSolve ? undefined : 'Solving arrives with issue #20'}
          >
            Solve →
          </button>
          {!validation.ok && <span className="muted">Complete the matrix to enable solving.</span>}
        </div>
      </div>

      {pasteOpen && <PasteModal n={matrix.n} onApply={applyPaste} onCancel={() => setPasteOpen(false)} />}
      </div>
    </>
  );
}
