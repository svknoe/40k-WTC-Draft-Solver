/** Official Warhammer 40k World Team Championship event windows. During these
 * dates the trainer's coaching hints auto-disable so the app can't be used to
 * gain an edge at the table (docs/design-mockup.html privacy explainer).
 *
 * Inclusive local-date ranges. MAINTAIN ANNUALLY — add each year's event.
 * Source: wtc-belgium.com (WTC 2026: 11–16 Aug, Nekkerhallen, Mechelen, BE). */
export interface WtcEvent {
  name: string;
  /** Inclusive start, ISO YYYY-MM-DD (local date). */
  start: string;
  /** Inclusive end, ISO YYYY-MM-DD (local date). */
  end: string;
}

export const WTC_EVENTS: WtcEvent[] = [
  { name: 'WTC 2026 · Mechelen', start: '2026-08-11', end: '2026-08-16' },
];

/** Local-time YYYY-MM-DD stamp (comparable lexicographically as a date). */
function localDateStamp(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** The WTC event in progress on `now` (the player's local date), or null.
 * `events` is injectable for tests. */
export function activeWtcEvent(now: Date, events: WtcEvent[] = WTC_EVENTS): WtcEvent | null {
  const today = localDateStamp(now);
  return events.find((e) => today >= e.start && today <= e.end) ?? null;
}
