import { fromSaved, toSaved } from './matrix';
import type { EditorMatrix, SavedMatrix } from './matrix';

const KEY = 'wtcDraftTrainer';

export interface Settings {
  /** Colourblind-safe palette. */
  cb: boolean;
  /** Simple (vs advanced) mode. */
  simpleMode: boolean;
}

export interface AppState {
  settings: Settings;
  saves: Record<string, EditorMatrix>;
  /** The working matrix, auto-restored on load (null before first entry). */
  current: EditorMatrix | null;
}

function defaults(): AppState {
  return { settings: { cb: false, simpleMode: true }, saves: {}, current: null };
}

function tryFromSaved(s: unknown): EditorMatrix | null {
  try {
    return fromSaved(s as SavedMatrix);
  } catch {
    return null;
  }
}

/** Restore the persisted app state (docs/web-design.md §4.2). Tolerant: any
 * corruption falls back to defaults / drops the offending save. */
export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const data = JSON.parse(raw) as {
      cb?: unknown; simpleModeV2?: unknown;
      saves?: Record<string, unknown>; current?: unknown;
    };
    const saves: Record<string, EditorMatrix> = {};
    for (const [name, saved] of Object.entries(data.saves ?? {})) {
      const m = tryFromSaved(saved);
      if (m) saves[name] = m;
    }
    return {
      settings: {
        cb: Boolean(data.cb),
        simpleMode: data.simpleModeV2 === undefined ? true : Boolean(data.simpleModeV2),
      },
      saves,
      current: data.current ? tryFromSaved(data.current) : null,
    };
  } catch {
    return defaults();
  }
}

export function saveState(state: AppState): void {
  const saves: Record<string, SavedMatrix> = {};
  for (const [name, m] of Object.entries(state.saves)) saves[name] = toSaved(m);
  const blob = {
    cb: state.settings.cb,
    simpleModeV2: state.settings.simpleMode,
    saves,
    current: state.current ? toSaved(state.current) : null,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(blob));
  } catch {
    // Storage unavailable (private mode / quota) — the app still works,
    // it just won't persist. Nothing else to do.
  }
}
