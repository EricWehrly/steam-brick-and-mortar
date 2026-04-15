# Feature: GPU Memory Leak Investigation

**Act**: Intermission  
**Status**: Not Started  
**Priority**: Low (investigate before Act 2 ramp; don't block background reduction work)

## Goal

Determine whether the app accumulates GPU VRAM across sessions, sort cycles, or detail panel interactions — and if so, identify and fix the leaking resource type (textures, geometries, render targets).

## Context

Killing the browser GPU process recovers most RAM, suggesting a genuine GPU-side leak rather than a JS heap issue. `performance.memory` (Chrome-only JS heap) and `renderer.info.memory` (Three.js object counts) have not surfaced obvious accumulation, but neither measures actual VRAM. The leak may be from:

- Textures not disposed on sort/re-render cycles (canvas sign textures, procedural textures)
- Geometry not disposed when shelves or game boxes are replaced
- Render targets or framebuffers held by Three.js internals (e.g., shadow maps, environment maps)
- Browser holding GPU resources after JS objects are GC'd (`.dispose()` not called before dereferencing)

## Acceptance Criteria

- In-app periodic reporter (dev mode only) logs `renderer.info.memory` trends every 60 s
- If geometry or texture count grows monotonically across sort cycles, root cause is identified and fixed
- A specific "no leak" baseline is documented (expected geometry/texture counts after full store load)

## Investigation Options (ranked by effort/payoff)

### Option 1 — `renderer.info.memory` periodic reporter (start here)

**Effort**: ~2 hours  
**What it gives**: Three.js object counts (geometries, textures). Detects disposal failures on the JS side. Won't catch pure VRAM leaks if `.dispose()` is called correctly.

**Implementation plan**:
- In dev mode, sample `renderer.info.memory` + `renderer.info.render` every 60 s
- First report fires unconditionally ("no significant changes" if stable)
- Subsequent reports only print a detail line if geometry or texture count has grown since the last sample
- Wire into existing debug window helpers (`window.dumpThreejsMemory()` for on-demand snapshot)
- Gate behind `AppSettings.developmentMode` — zero overhead in production

**Threshold for "significant growth"**: ≥5 geometries or ≥5 textures gained since last sample.

### Option 2 — Chrome DevTools Memory tab → Heap snapshot

**Effort**: Manual, no code  
**What it gives**: JS heap view — Detached HTMLElements, ImageBitmap objects, ArrayBuffers. Good for catching textures whose JS wrapper was GC'd without `.dispose()` being called first.

**How to use**:
1. Load the store, let it fully populate
2. DevTools → Memory → Take Heap Snapshot (label: "baseline")
3. Trigger a sort cycle or two
4. Take another snapshot
5. Switch to "Comparison" view, filter by "Detached" — look for growing ImageBitmap/ArrayBuffer entries

### Option 3 — Chrome Task Manager GPU process

**Effort**: Trivial, manual  
**What it gives**: Real GPU process memory in MB. Not precise but confirms whether the browser GPU process grows over time.

`Shift+Esc` → GPU Process row. Compare before/after sort cycle, before/after detail panel, before/after blur overlay toggle.

### Option 4 — Playwright scripted heap tracking

**Effort**: Medium  
**What it gives**: Automated JS heap trends across a scripted session. Still JS-heap only.

Run Playwright with `--js-flags=--expose-gc --enable-precise-memory-info`. Call `page.evaluate(() => window.gc())` between steps, snapshot `performance.memory.usedJSHeapSize`.

Useful for catching accumulation that only appears after many cycles (N sort → N render → N sort).

### Option 5 — CDP `Performance.getMetrics()` via Playwright

**Effort**: High  
**What it gives**: Chrome DevTools Protocol metrics including some GPU-adjacent heap numbers. Not true VRAM but closer than JS heap.

Not recommended until options 1-3 have been exhausted.

## Baseline (expected counts — to be confirmed)

After full store load with ~500 games, 47 shelves, no sort applied:

| Metric | Expected | Notes |
|--------|----------|-------|
| `renderer.info.memory.geometries` | ~60-80 | Shelf geometry (instanced = 1), floor, walls, sign planes |
| `renderer.info.memory.textures` | ~50-100 | Skybox, procedural textures, canvas signs, artwork cache |
| `renderer.info.render.calls` | ~15-25 | Post draw-call work (end-cap signs disabled) |

These should be stable after startup. Any growth during idle is a leak.

## Related

- `bugs.md` — "Unexpected cache clearing" (separate, but cache behaviour affects memory)
- `docs/agent-context/performance-metrics.md` — measurement reference
- `docs/tech-debt.md` — `shelf-end-cap-signs` (canvas signs are a disposal risk)
- Option 1 implementation: `src/debug/GpuMemoryReporter.ts` (to be created)
