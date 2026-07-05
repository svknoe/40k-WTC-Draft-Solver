import { useState } from 'react';

interface PasteModalProps {
  n: number;
  onApply: (text: string) => void;
  onCancel: () => void;
}

export function PasteModal({ n, onApply, onCancel }: PasteModalProps) {
  const [text, setText] = useState('');

  return (
    <div className="modal-backdrop" onClick={onCancel} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Paste from spreadsheet">
        <h2>Paste from spreadsheet</h2>
        <p className="muted">
          {n} rows × {n} cells, tab / comma / semicolon separated. Cells like <b>15/12</b>, single
          numbers like <b>13</b>, or {2 * n} plain number columns (best, worst alternating).
        </p>
        <textarea
          autoFocus
          rows={8}
          value={text}
          aria-label="Pasted matrix"
          placeholder={'15/12\t11/8\t…'}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="modal-actions">
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={() => onApply(text)}>Apply to grid</button>
        </div>
      </div>
    </div>
  );
}
