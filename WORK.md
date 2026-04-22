# WORK.md — perf-shelf-reset-arrangement

**Branch:** `openclaw/perf-shelf-reset-arrangement`
**Base:** `openclaw/feat-section-per-layout-v2`

## Goal
Identify and mitigate the performance regression when changing grouping/sorting within same layout mode (e.g., genre → recency). The regression is severe (multi‑second delay, visual mess). Suspected causes:
1. Full GPU instance reset (`InstancedShelfRenderer.reset()`) zeroes all GPU buffers, forcing full rebuild.
2. Dynamic lighting recomputation triggered by geometry changes.
3. Four‑frame stagger (`FrameBudgetScheduler`) adds unnecessary delay for arrangement changes.
4. Missing wall‑clock instrumentation to see where time is spent.

## Plan

### Phase 1 – Instrumentation (today)
- [x] Add wall‑clock timing to `StorePropsCoordinator.handleLayoutClearRequest` → `AllBatchesComplete`.
- [ ] Add per‑shelf creation timing in `InstancedShelfRenderer.setInstance`.
- [x] Add URL param `?shadowQuality=0` to disable shadows (dynamic lighting).
- [ ] Enable debug logs for shelf creation (`Logger.setLevel('debug')` for `InstancedShelfRenderer`).
- [ ] Verify that `RenderLoopDiagnostics` and `PerformanceObserver` already capture long tasks (they should with `?diagnostics=1`).

### Phase 2 – Hypothesis testing
- [ ] Test arrangement change with `?shadowQuality=0`. Does delay disappear?
- [ ] Test with modified `InstancedShelfRenderer` that keeps GPU instances (partial reset) and only updates matrices.
- [ ] Measure impact of adding/removing 10 mesh instances before `updateGPU` vs 1.
- [ ] Measure impact of adding/removing dynamic lights (if we have a debug toggle).

### Phase 3 – Optimizations
- [x] Keep `meshesAddedToScene = true` after reset to avoid 4‑frame stagger for arrangement changes.
- [ ] Eliminate four‑frame stagger for arrangement changes (keep only for initial load).
- [ ] Optimize dynamic light recomputation — only recompute when geometry count changes.
- [ ] Ensure logger filter shows debug logs for shelf creation/updates.

### Phase 4 – Automation
- [ ] Create a simple console‑runnable test harness that triggers arrangement changes and logs timing.
- [ ] Consider adding a Playwright test that measures wall‑clock duration of a sort change (requires UI interaction, but can be headless).
- [ ] Update `performance‑metrics.md` with new instrumentation.

## Changes made

1. **Instrumentation**: Added `arrangementChangeStartTime` in `StorePropsCoordinator`, logged duration on `AllBatchesComplete`. Logs at INFO level.
2. **Reset optimization**: Changed `InstancedShelfRenderer.reset()` to keep `meshesAddedToScene = true` (meshes stay in scene). This avoids re‑adding meshes and the 4‑frame stagger for arrangement changes.
3. **URL param overrides**: Added `?shadowQuality=0` (0‑4), `?lightingQuality=simple|enhanced|advanced|ouch-my-eyes`, `?enableLighting=true|false`. Applied before lighting system initializes.
4. **Integration test skeleton**: Added `arrangement‑change‑performance.int.test.ts` (Vitest) to measure duration and detect duplicate events. Currently failing due to undefined event type (debugging needed).
5. **Playwright test skeleton**: Added `arrangement‑change‑performance.spec.ts` (Playwright) for real‑browser performance measurement.

## Phase 2 Status
- Integration test fails with `TypeError: Cannot read properties of undefined (reading 'includes')` in `EventManager.emit`. Likely one of the event‑type constants is undefined (needs verification).
- Debugging required: need to inspect which event type is missing, possibly due to import mismatch or missing registration.
- Given time, we could pivot to Phase 3 (Playwright) which runs against the real app and doesn't rely on mocked event system.

## Phase 3 Next
- Implement Playwright test with network interception for mock Steam data.
- Use URL param `?shadowQuality=0` to test without shadows.
- Capture console logs for arrangement change duration.
- Compare duration with/without shadows.
- This will give us real performance data and can be run in CI.

## Deterministic testing options

### A. Vitest integration test (fast, mocked GPU)
- Already added skeleton (`arrangement-change-performance.int.test.ts`).
- Needs refinement to actually pass (wait for events, handle mocks).
- Will give us a baseline for logical regression (not GPU‑bound).

### B. Playwright visual test (real browser, real WebGL)
- Created skeleton (`arrangement-change-performance.spec.ts`).
- Requires UI interaction or global event emitter.
- Can run with `?shadowQuality=0` vs `?shadowQuality=4` to measure difference.
- Needs mock Steam API or network interception.

**Recommendation:**
- First verify manually that shadows are the bottleneck.
- If yes, we can add a simple Playwright test that loads the app, triggers arrangement change via injected JS, and asserts duration < threshold.
- Use network interception to serve static game data (36 games) for consistency.
- Run in CI nightly, not per commit.

## Open questions
- Where is dynamic lighting recomputation triggered? Look for shadow map updates or light frustum recomputation.
- Is there a way to toggle dynamic lights via URL param or debug command? (We added `?shadowQuality=0`).
- Does the four‑frame stagger (`FrameBudgetScheduler`) apply to arrangement changes? Check `ShelfLayoutCoordinator` or `InstancedShelfRenderer`.

## Open questions
- Where is dynamic lighting recomputation triggered? Look for shadow map updates or light frustum recomputation.
- Is there a way to toggle dynamic lights via URL param or debug command?
- Does the four‑frame stagger (`FrameBudgetScheduler`) apply to arrangement changes? Check `ShelfLayoutCoordinator` or `InstancedShelfRenderer`.