import type { CSSProperties } from 'react';
import type { Disposition } from '../model/dispositions';
import { DISPOSITIONS, DISPOSITION_LABELS } from '../model/dispositions';
import type { EditorCell, EditorMatrix, MapTriple } from '../model/matrix';
import { MAP_LETTERS, cellValue, defaultEnemyName, defaultMyName } from '../model/matrix';
import { FACTIONS, FACTION_SET } from '../model/factions';
import { formatMatchupScore } from '../model/scale';
import { pointClass } from './palette';

interface GridProps {
  matrix: EditorMatrix;
  simpleMode: boolean;
  cellErrors: (string | null)[][];
  /** Freeze every input (names + cells) — set while a draft locks the matrix. */
  readOnly?: boolean;
  onCellChange: (i: number, j: number, cell: EditorCell) => void;
  onMyName: (i: number, name: string) => void;
  onEnemyName: (j: number, name: string) => void;
  onMyDisposition: (i: number, disposition: Disposition) => void;
  onEnemyDisposition: (j: number, disposition: Disposition) => void;
}

interface FactionSelectProps {
  /** The stored faction name, or '' for the Player N / Opponent K default. */
  value: string;
  side: 'mine' | 'enemy';
  /** The positional label shown as the top (unset) option. */
  defaultLabel: string;
  /** Factions already taken on THIS team (non-empty names); a faction other
   * than the player's own current pick is greyed out when it's in this set. */
  taken: ReadonlySet<string>;
  ariaLabel: string;
  readOnly: boolean;
  onChange: (value: string) => void;
}

/** A faction picker: the positional default on top, then every faction
 * alphabetically with same-team duplicates disabled. A non-faction current
 * value (imported/legacy free-text) gets its own option so it still displays
 * and round-trips. `<select>` has no readOnly, so a locked draft disables it.
 * The select is overlaid transparently on a wrapping text label (see below). */
function FactionSelect({ value, side, defaultLabel, taken, ariaLabel, readOnly, onChange }: FactionSelectProps) {
  const legacy = value.trim() !== '' && !FACTION_SET.has(value);
  return (
    // The visible label wraps onto two lines so long factions read in full; the
    // native select sits transparently on top of it, so the dropdown, keyboard
    // and screen-reader behaviour are unchanged.
    <div className={`faction-pick ${side}`}>
      <span className="faction-label" aria-hidden="true">{value.trim() || defaultLabel}</span>
      <select
        className="faction-select"
        value={value}
        aria-label={ariaLabel}
        disabled={readOnly}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{defaultLabel}</option>
        {legacy && <option value={value}>{value}</option>}
        {FACTIONS.map((f) => (
          <option key={f} value={f} disabled={taken.has(f) && f !== value}>{f}</option>
        ))}
      </select>
    </div>
  );
}

interface DispositionSelectProps {
  value: Disposition;
  ariaLabel: string;
  readOnly: boolean;
  onChange: (value: Disposition) => void;
}

/** A coloured pill picking a player's force disposition ('' shows a dashed
 * "disp?"). Display only — the solver ignores dispositions. */
function DispositionSelect({ value, ariaLabel, readOnly, onChange }: DispositionSelectProps) {
  return (
    <select
      className={`disp disp-${value || 'unset'}`}
      value={value}
      aria-label={ariaLabel}
      disabled={readOnly}
      onChange={(e) => onChange(e.target.value as Disposition)}
    >
      <option value="">disp?</option>
      {DISPOSITIONS.map((d) => (
        <option key={d} value={d}>{DISPOSITION_LABELS[d]}</option>
      ))}
    </select>
  );
}

interface MatrixCellProps {
  cell: EditorCell;
  simpleMode: boolean;
  /** "<row> vs <col>" — the base of every aria label in the tile. */
  label: string;
  error: string | null;
  readOnly: boolean;
  onChange: (cell: EditorCell) => void;
}

/** One square matchup tile, filled with the palette colour of the value it
 * shows. By-map mode: the read-only map average in the centre and the A/B/C
 * inputs in a strip along the bottom. Single mode: the centre number is itself
 * the input. A blank or unparseable cell draws neutral. */
function MatrixCell({ cell, simpleMode, label, error, readOnly, onChange }: MatrixCellProps) {
  const value = cellValue(cell, simpleMode);
  // A fully-blank cell is "unfilled", not wrong — don't flag it red (Solve
  // stays gated by validation either way). "Blank" is judged on the active
  // layer, since the inactive one may be legitimately empty.
  const blank = simpleMode ? cell.s.trim() === '' : cell.maps.every((raw) => raw.trim() === '');
  const showError = error !== null && !blank;
  const setMap = (k: number, raw: string) => {
    const maps: MapTriple = [...cell.maps];
    maps[k] = raw;
    onChange({ ...cell, maps });
  };

  return (
    <td className={showError ? 'cell invalid' : 'cell'} title={showError ? error : undefined}>
      <div className={value === null ? 'tile empty' : `tile ${pointClass(value)}`}>
        {simpleMode ? (
          <input
            className="tile-value"
            value={cell.s}
            placeholder="–"
            aria-label={label}
            inputMode="decimal"
            readOnly={readOnly}
            onChange={(e) => onChange({ ...cell, s: e.target.value })}
          />
        ) : (
          <>
            <output className="tile-value" aria-label={`${label} average`} aria-live="off">
              {value === null ? '–' : formatMatchupScore(value)}
            </output>
            <div className="tile-maps">
              {MAP_LETTERS.map((letter, k) => (
                <input
                  key={letter}
                  className="map-input"
                  value={cell.maps[k]}
                  placeholder={letter}
                  aria-label={`${label} map ${letter}`}
                  inputMode="decimal"
                  readOnly={readOnly}
                  onChange={(e) => setMap(k, e.target.value)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </td>
  );
}

export function Grid({
  matrix, simpleMode, cellErrors, readOnly = false,
  onCellChange, onMyName, onEnemyName, onMyDisposition, onEnemyDisposition,
}: GridProps) {
  const { myNames, enemyNames, cells } = matrix;
  // Factions in use on each team — including each player's OWN pick, so a
  // select greys out only the picks it does NOT hold (FactionSelect's
  // `f !== value` guard keeps a player's own faction selectable).
  const myTaken = new Set(myNames.map((s) => s.trim()).filter(Boolean));
  const enemyTaken = new Set(enemyNames.map((s) => s.trim()).filter(Boolean));

  return (
    <div className="grid-scroll">
      {/* --n sizes the table so the tiles stay square at every team size. */}
      <table className="grid" style={{ '--n': matrix.n } as CSSProperties}>
        <thead>
          <tr>
            <th className="corner">{simpleMode ? 'single rating' : 'by map'}</th>
            {enemyNames.map((name, j) => (
              <th key={j} className="col-head">
                <FactionSelect
                  side="enemy"
                  value={name}
                  defaultLabel={defaultEnemyName(j)}
                  taken={enemyTaken}
                  ariaLabel={`Opponent player ${j + 1} faction`}
                  readOnly={readOnly}
                  onChange={(v) => onEnemyName(j, v)}
                />
                <DispositionSelect
                  value={matrix.enemyDispositions[j]}
                  ariaLabel={`Opponent player ${j + 1} disposition`}
                  readOnly={readOnly}
                  onChange={(d) => onEnemyDisposition(j, d)}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {myNames.map((rowName, i) => (
            <tr key={i}>
              <th className="row-head">
                <div className="row-head-inner">
                  <FactionSelect
                    side="mine"
                    value={rowName}
                    defaultLabel={defaultMyName(i)}
                    taken={myTaken}
                    ariaLabel={`Your player ${i + 1} faction`}
                    readOnly={readOnly}
                    onChange={(v) => onMyName(i, v)}
                  />
                  <DispositionSelect
                    value={matrix.myDispositions[i]}
                    ariaLabel={`Your player ${i + 1} disposition`}
                    readOnly={readOnly}
                    onChange={(d) => onMyDisposition(i, d)}
                  />
                </div>
              </th>
              {cells[i].map((cell, j) => (
                <MatrixCell
                  key={j}
                  cell={cell}
                  simpleMode={simpleMode}
                  label={`${rowName || `P${i + 1}`} vs ${enemyNames[j] || `E${j + 1}`}`}
                  error={cellErrors[i][j]}
                  readOnly={readOnly}
                  onChange={(next) => onCellChange(i, j, next)}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
