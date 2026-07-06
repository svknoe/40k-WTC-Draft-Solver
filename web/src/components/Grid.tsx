import type { EditorCell, EditorMatrix } from '../model/matrix';
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

export function Grid({
  matrix, simpleMode, cellErrors, readOnly = false, onCellChange, onMyName, onEnemyName,
}: GridProps) {
  const { myNames, enemyNames, cells } = matrix;

  return (
    <div className="grid-scroll">
      <table className="grid">
        <thead>
          <tr>
            <th className="corner">{simpleMode ? 'single rating' : 'best / worst map'}</th>
            {enemyNames.map((name, j) => (
              <th key={j} className="col-head">
                <input
                  className="name enemy"
                  value={name}
                  placeholder={`Enemy ${j + 1}`}
                  aria-label={`Enemy player ${j + 1} name`}
                  readOnly={readOnly}
                  onChange={(e) => onEnemyName(j, e.target.value)}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {myNames.map((rowName, i) => (
            <tr key={i}>
              <th className="row-head">
                <input
                  className="name mine"
                  value={rowName}
                  placeholder={`Player ${i + 1}`}
                  aria-label={`Your player ${i + 1} name`}
                  readOnly={readOnly}
                  onChange={(e) => onMyName(i, e.target.value)}
                />
              </th>
              {cells[i].map((cell, j) => {
                const err = cellErrors[i][j];
                // A fully-blank cell is "unfilled", not wrong — don't flag it
                // red (Solve stays gated by validation either way).
                const blank = cell.b.trim() === '' && cell.w.trim() === '';
                const showError = err !== null && !blank;
                const label = `${rowName || `P${i + 1}`} vs ${enemyNames[j] || `E${j + 1}`}`;
                return (
                  <td key={j} className={showError ? 'cell invalid' : 'cell'} title={showError ? err : undefined}>
                    {simpleMode ? (
                      <input
                        className={`cell-input ${bandClass(cell.b)}`}
                        value={cell.b}
                        aria-label={label}
                        inputMode="decimal"
                        readOnly={readOnly}
                        onChange={(e) => onCellChange(i, j, { b: e.target.value, w: e.target.value })}
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
