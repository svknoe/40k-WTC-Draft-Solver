import type { EditorCell, EditorMatrix } from '../model/matrix';
import { defaultEnemyName, defaultMyName } from '../model/matrix';
import { FACTIONS, FACTION_SET } from '../model/factions';
import { parseRating, scoreBand, toScore } from '../model/scale';

interface GridProps {
  matrix: EditorMatrix;
  simpleMode: boolean;
  cellErrors: (string | null)[][];
  /** Freeze every input (names + cells) — set while a draft locks the matrix. */
  readOnly?: boolean;
  onCellChange: (i: number, j: number, cell: EditorCell) => void;
  onMyName: (i: number, name: string) => void;
  onEnemyName: (j: number, name: string) => void;
}

/** Colour-band class for a raw cell value (blank/invalid → none). */
function bandClass(raw: string): string {
  try {
    return `band-${scoreBand(toScore(parseRating(raw)))}`;
  } catch {
    return '';
  }
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
 * and round-trips. `<select>` has no readOnly, so a locked draft disables it. */
function FactionSelect({ value, side, defaultLabel, taken, ariaLabel, readOnly, onChange }: FactionSelectProps) {
  const legacy = value.trim() !== '' && !FACTION_SET.has(value);
  return (
    <select
      className={`name ${side}`}
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
  );
}

export function Grid({
  matrix, simpleMode, cellErrors, readOnly = false, onCellChange, onMyName, onEnemyName,
}: GridProps) {
  const { myNames, enemyNames, cells } = matrix;
  // Factions in use on each team — including each player's OWN pick, so a
  // select greys out only the picks it does NOT hold (FactionSelect's
  // `f !== value` guard keeps a player's own faction selectable).
  const myTaken = new Set(myNames.map((s) => s.trim()).filter(Boolean));
  const enemyTaken = new Set(enemyNames.map((s) => s.trim()).filter(Boolean));

  return (
    <div className="grid-scroll">
      <table className="grid">
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
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {myNames.map((rowName, i) => (
            <tr key={i}>
              <th className="row-head">
                <FactionSelect
                  side="mine"
                  value={rowName}
                  defaultLabel={defaultMyName(i)}
                  taken={myTaken}
                  ariaLabel={`Your player ${i + 1} faction`}
                  readOnly={readOnly}
                  onChange={(v) => onMyName(i, v)}
                />
              </th>
              {cells[i].map((cell, j) => {
                const err = cellErrors[i][j];
                // A fully-blank cell is "unfilled", not wrong — don't flag it
                // red (Solve stays gated by validation either way). "Blank" is
                // judged on the active layer, since the inactive one may be
                // legitimately empty.
                const blank = simpleMode
                  ? cell.s.trim() === ''
                  : cell.b.trim() === '' && cell.w.trim() === '';
                const showError = err !== null && !blank;
                const label = `${rowName || `P${i + 1}`} vs ${enemyNames[j] || `E${j + 1}`}`;
                return (
                  <td key={j} className={showError ? 'cell invalid' : 'cell'} title={showError ? err : undefined}>
                    {simpleMode ? (
                      <input
                        className={`cell-input ${bandClass(cell.s)}`}
                        value={cell.s}
                        aria-label={label}
                        inputMode="decimal"
                        readOnly={readOnly}
                        onChange={(e) => onCellChange(i, j, { ...cell, s: e.target.value })}
                      />
                    ) : (
                      <div className="bw">
                        <input
                          className={`cell-input ${bandClass(cell.b)}`}
                          value={cell.b}
                          aria-label={`${label} best`}
                          inputMode="decimal"
                          readOnly={readOnly}
                          onChange={(e) => onCellChange(i, j, { ...cell, b: e.target.value })}
                        />
                        <span className="sep">/</span>
                        <input
                          className={`cell-input worst ${bandClass(cell.w)}`}
                          value={cell.w}
                          aria-label={`${label} worst`}
                          inputMode="decimal"
                          readOnly={readOnly}
                          onChange={(e) => onCellChange(i, j, { ...cell, w: e.target.value })}
                        />
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
