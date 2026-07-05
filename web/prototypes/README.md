# web/prototypes

Throwaway spikes that validate design decisions **before** the real web app exists.
Nothing here ships; none of it commits us to a framework or build tool.

## `contract-mock.html`

A self-contained, dependency-free validation of the **§3 UI⟷engine worker contract**
from [`../../docs/web-design.md`](../../docs/web-design.md). It runs the message
protocol end-to-end: the page (UI thread) posts `solve`/`node`/`reset`, and a real Web
Worker — built from an inline Blob — replies with `progress` events, then `solved` /
`nodeResult` / `error`. The worker's math is a **stub heuristic** (softmax over
per-choice values), not the real solver; its only purpose is to prove the *contract*
round-trips and yields well-formed `NodeResult`s.

On load it runs a **self-test** and shows a PASS/FAIL banner (details in the browser
console).

### Run it

Web Workers need an http origin (not `file://`). From the repo root:

```
python -m http.server 8137
# open http://localhost:8137/web/prototypes/contract-mock.html
```

Expect: `SELF-TEST: PASS ✓`.
