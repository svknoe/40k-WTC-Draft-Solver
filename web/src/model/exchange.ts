import { fromSaved, toSaved } from './matrix';
import type { EditorMatrix, SavedMatrix } from './matrix';

const FORMAT = 'wtc-matrix';
const VERSION = 1;
const UNREADABLE = 'Could not read that file — expected a matrix JSON exported from this app.';

/** Native JSON export: the SavedMatrix body plus a format/version header
 * (docs/web-design.md §4.3). Human-portable, re-importable. */
export function exportJson(m: EditorMatrix): string {
  return JSON.stringify({ format: FORMAT, version: VERSION, ...toSaved(m) }, null, 2);
}

/** Parse an exported matrix file back to an EditorMatrix. Throws a friendly
 * message on non-JSON / missing header, or a shape-specific message (rows /
 * columns / size) from fromSaved. */
export function importJson(text: string): EditorMatrix {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(UNREADABLE);
  }
  if (typeof data !== 'object' || data === null || (data as { format?: unknown }).format !== FORMAT) {
    throw new Error(UNREADABLE);
  }
  return fromSaved(data as SavedMatrix);
}
