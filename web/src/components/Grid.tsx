import type { CSSProperties } from 'react';
import type { Disposition } from '../model/dispositions';
import { DISPOSITIONS, DISPOSITION_LABELS } from '../model/dispositions';
import type { EditorCell, EditorMatrix, MapLetter, MapTriple } from '../model/matrix';
import { MAP_LETTERS, cellValue, defaultEnemyName, defaultMyName, meanOf } from '../model/matrix';
import { FACTIONS, FACTION_SET } from '../model/factions';
import { pointClass, pointStep } from './palette';

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
 * "disposition"). Display only — the solver ignores dispositions. */
function DispositionSelect({ value, ariaLabel, readOnly, onChange }: DispositionSelectProps) {
  return (
    <select
      className={`disp disp-${value || 'unset'}`}
      value={value}
      aria-label={ariaLabel}
      disabled={readOnly}
      onChange={(e) => onChange(e.target.value as Disposition)}
    >
      <option value="">disposition</option>
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
  /** The map neutral games are played on — outlined in the strip. */
  neutralMap: MapLetter;
  onChange: (cell: EditorCell) => void;
}

/** One square matchup tile, filled with the palette colour of the value it
 * shows. By-map mode: the read-only map average in the centre — rounded to the
 * whole score its colour stands for — and the A/B/C inputs in a strip along
 * the bottom. Single mode: the centre number is itself the input. A blank or
 * unparseable cell draws neutral. */
function MatrixCell({ cell, simpleMode, label, error, readOnly, neutralMap, onChange }: MatrixCellProps) {
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
            aria-invalid={showError || undefined}
            inputMode="numeric"
            readOnly={readOnly}
            onChange={(e) => onChange({ ...cell, s: e.target.value })}
          />
        ) : (
          <>
            <output className="tile-value" aria-label={`${label} average`} aria-live="off">
              {value === null ? '–' : pointStep(value)}
            </output>
            <div className="tile-maps">
              {MAP_LETTERS.map((letter, k) => (
                <input
                  key={letter}
                  className={letter === neutralMap ? 'map-input neutral' : 'map-input'}
                  title={letter === neutralMap ? `Neutral games are played on map ${letter}` : undefined}
                  value={cell.maps[k]}
                  placeholder={letter}
                  aria-label={`${label} map ${letter}`}
                  aria-invalid={showError || undefined}
                  inputMode="numeric"
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

/** An AVG row/column entry: always one decimal, a dash when nothing is filled. */
const formatAverage = (value: number | null): string => (value === null ? '–' : value.toFixed(1));

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
  const values = cells.map((row) => row.map((cell) => cellValue(cell, simpleMode)));
  const rowLabel = (i: number) => myNames[i] || `P${i + 1}`;
  const colLabel = (j: number) => enemyNames[j] || `E${j + 1}`;

  return (
    <div className="grid-scroll">
      {/* --n sizes the table so the tiles stay square at every team size. */}
      <table className="grid" style={{ '--n': matrix.n } as CSSProperties}>
        <thead>
          <tr>
            <th className="corner">{simpleMode ? 'single rating' : 'by map'}</th>
            {enemyNames.map((name, j) => (
              <th key={j} className="col-head">
                {/* A size container (table cells can't be one), so the pill can
                    scale its text to the column width. */}
                <div className="col-head-inner">
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
                </div>
              </th>
            ))}
            <th className="avg-head">avg</th>
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
                  label={`${rowLabel(i)} vs ${colLabel(j)}`}
                  error={cellErrors[i][j]}
                  readOnly={readOnly}
                  neutralMap={matrix.neutralMap}
                  onChange={(next) => onCellChange(i, j, next)}
                />
              ))}
              <td className="avg" aria-label={`${rowLabel(i)} row average`}>{formatAverage(meanOf(values[i]))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th className="avg-head avg-foot">avg</th>
            {enemyNames.map((_, j) => (
              <td key={j} className="avg" aria-label={`${colLabel(j)} column average`}>
                {formatAverage(meanOf(values.map((row) => row[j])))}
              </td>
            ))}
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
