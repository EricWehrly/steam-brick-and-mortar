# Performance Metrics Reference

> **Reading priority**: Non-mandatory. Read this when asked "what metrics are we tracking?" or when setting up a new measurement or test. Not required for feature work.

---

## What we track and why

| Metric | Target | Why it matters |
|---|---|---|
| **Startup wall-clock** | < 5s to store populated (warm cache) | First impression; regression risk as we add content |
| **Frame time** | < 16.67ms avg (60fps budget) | Smoothness during browsing and interaction |
| **Draw calls (DC)** | ≤ 20 idle (was 17; now ~50–70, regressed) | GPU submission overhead; instancing is supposed to keep this low |
| **Main-thread hitches** | No frame > 50ms | Single-frame freezes break immersion |
| **Persistent slowdowns** | No sustained frame-time increase after UI interactions | Indicates new scene objects or compositor layers added permanently |
| **VRAM (est.)** | < 200MB tracked; actual higher | Texture arrays are our biggest consumer |
| **Memory (JS heap)** | Stable across sort cycles (no monotonic growth) | Leak canary; JS heap is the measurable proxy for GPU-side disposal failures |

---

## How to measure each

### Startup timing
Wall-clock timer lines fire automatically in the console when `?diagnostics=1` is **not** required:
```
⏱️  [T+0.7s]  Player can move (controls ready)
⏱️  [T+3.8s]  Store first content visible
⏱️  [T+4.0s]  Store fully populated
⏱️  [T+4.3s]  World detail enhanced (textures)
```
Call `StartupEventTracker.instance.printSummary()` in the console for the phase table (sync spans only).

### Frame time + per-callback breakdown
Requires `?diagnostics=1` URL param. After ≥ 60 frames:
```js
renderLoopDiagnostics.getStats()
// → { frameCount, peakFrameTime, slowFrameCount, callbackAvgs: { id: { avg, peak } } }
```
Slow frames (> 16.67ms) also fire immediate `⚠️` warnings in the console.

**Limitation**: `RenderLoopDiagnostics` only measures work inside registered render-loop callbacks. Work triggered by click/event handlers between frames is invisible to it. Use the perf widget (top-right) or browser DevTools Performance tab for inter-frame spikes.

### Draw calls
The perf widget (top-right, always visible) shows live DC count as "DC: N".

In the console:
```js
window.sceneManager.drawCallReport()   // full breakdown by object
```
`renderer.info.render.calls` is the raw Three.js value.

**Known regression**: DC was ~17 at initial instancing implementation. Currently 50–70. The jump correlates with opening the game detail panel — suspected cause is `overflow-y: auto` on `.detail-content` creating a new compositor layer that persists until the panel is closed. Tracked as a bug; see `docs/bugs.md`.

**Empirical test target**: A Playwright or Vitest integration test that renders a frame, reads `renderer.info.render.calls`, and asserts `<= 25` (idle, no detail panel). This is the single most important missing test for catching DC regressions early.

### Main-thread hitches (inter-frame)
`?diagnostics=1` does **not** catch these. Options:
- **Browser DevTools** → Performance tab → record → look for long tasks (orange bars > 50ms)
- **PerformanceObserver** (programmatic, automatable):
  ```js
  new PerformanceObserver(list => {
    for (const entry of list.getEntries())
      console.warn(`Long task: ${entry.duration.toFixed(1)}ms`, entry)
  }).observe({ type: 'longtask', buffered: true })
  ```
  We should wire this into `RenderLoopDiagnostics` when `enabled: true` so it shows up in the same log stream.

### JS heap / memory leak detection
`GpuMemoryReporter` runs automatically in dev mode (`developmentMode: true` in Settings).
Baseline is captured at `AllBatchesComplete`; samples every ~4000 frames (~67s at 60fps).
Logged to console at `debug` level — enable verbose logs in Chrome to see them.

On-demand:
```js
window.dumpGpuMemory()   // full GpuMemoryEstimator breakdown (texture sizes, registered VRAM)
```

**Finding (2026-04-15)**: JS heap shows an initial decrease after store load (GC collecting startup
allocations), then stable utilization. No monotonic growth detected across sort cycles. The
original suspicion of a GPU-side leak is not confirmed by the JS heap proxy — actual VRAM
would require Chrome Task Manager (Shift+Esc → GPU Process row) or CDP tooling.


---

## Where things live in the codebase

| Thing | Location |
|---|---|
| Wall-clock startup timers | `StartupEventTracker.printTimer()` — fires on events |
| Frame-time diagnostics | `client/src/debug/RenderLoopDiagnostics.ts` |
| DC widget (live) | `PerformanceMonitor.ts` — rendered by `SystemUICoordinator` |
| DC scene breakdown | `SceneManagerDebug.drawCallReport()` → `window.sceneManager.drawCallReport()` |
| VRAM estimates / on-demand | `GpuMemoryEstimator` — `window.dumpGpuMemory()` |
| Heap trend reporter | `GpuMemoryReporter` — auto-runs in dev mode, logs every ~4000 frames |
| Startup phase table | `StartupEventTracker` — `window.StartupEventTracker.instance.printSummary()` |

---

## Known gaps

1. **Draw call regression test** — no automated assertion on DC count. Adding one is the highest-value next step for catching regressions.
- **Long-task / inter-frame hitch detection** — `RenderLoopDiagnostics` is blind to click-handler work. `PerformanceObserver({ type: 'longtask' })` is wired when `?diagnostics=1` is set, but **Firefox does not support the `longtask` entry type** — Chrome only. For Firefox, use the DevTools Performance tab.
3. **Memory** — `GpuMemoryReporter` now gives JS heap trends in dev mode. Confirmed stable (no leak) as of 2026-04-15. Actual VRAM growth would require Chrome Task Manager or CDP; not yet automated.
4. **DC breakdown by source** — `drawCallReport()` exists but isn't wired to any automated check.
