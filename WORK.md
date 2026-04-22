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
- [ ] Add a flag `?dynamicLights=0` to suppress dynamic lighting updates (if any).
- [ ] Enable debug logs for shelf creation (`Logger.setLevel('debug')` for `InstancedShelfRenderer`).
- [ ] Verify that `RenderLoopDiagnostics` and `PerformanceObserver` already capture long tasks (they should with `?diagnostics=1`).

### Phase 2 – Hypothesis testing
- [ ] Test arrangement change with `?dynamicLights=0`. Does delay disappear?
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

## Next steps
- Run dev server with `?diagnostics=1` and observe logs for arrangement change duration.
- Determine if the 4‑frame stagger is still a factor (maybe `sceneInsertCancelled` prevents tasks).
- Look for dynamic lighting/shadow recomputation triggers.
- Add per‑shelf timing to see if matrix updates are heavy.
- Consider partial reset: keep GPU instances and update matrices only (requires tracking which shelves changed).

### Phase 2 – Hypothesis testing
- [ ] Test arrangement change with `?dynamicLights=0`. Does delay disappear?
- [ ] Test with modified `InstancedShelfRenderer` that keeps GPU instances (partial reset) and only updates matrices.
- [ ] Measure impact of adding/removing 10 mesh instances before `updateGPU` vs 1.
- [ ] Measure impact of adding/removing dynamic lights (if we have a debug toggle).

### Phase 3 – Optimizations
- [ ] Implement partial reset when shelf count unchanged (keep GPU instances, update positions).
- [ ] Eliminate four‑frame stagger for arrangement changes (keep only for initial load).
- [ ] Optimize dynamic light recomputation — only recompute when geometry count changes.
- [ ] Ensure logger filter shows debug logs for shelf creation/updates.

### Phase 4 – Automation
- [ ] Create a simple console‑runnable test harness that triggers arrangement changes and logs timing.
- [ ] Consider adding a Playwright test that measures wall‑clock duration of a sort change (requires UI interaction, but can be headless).
- [ ] Update `performance‑metrics.md` with new instrumentation.

## Current status
Branch created. Need to start with instrumentation.

## Open questions
- Where is dynamic lighting recomputation triggered? Look for shadow map updates or light frustum recomputation.
- Is there a way to toggle dynamic lights via URL param or debug command?
- Does the four‑frame stagger (`FrameBudgetScheduler`) apply to arrangement changes? Check `ShelfLayoutCoordinator` or `InstancedShelfRenderer`.