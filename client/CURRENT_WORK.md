
## rAF Usage Audit

A survey of `requestAnimationFrame` (rAF) and `setAnimationLoop` usage across the codebase was conducted to identify redundancies and opportunities for consolidation into the `RenderLoopRegistry`.

### 1. Existing rAF Usages

| File | Purpose | Loop Type | Registry Status | Lifecycle Notes |
|------|---------|-----------|-----------------|-----------------|
| `SceneManager.ts` | Main Render Loop | `renderer.setAnimationLoop` | **Owner** | The primary loop. Calls `RenderLoopRegistry.executeAll()`. |
| `StartupEventTracker.ts` | Hitch Detector | Independent rAF | Independent | Runs during blocking startup phases. Stops when `Interactive` phase ends. |
| `PerformanceMonitor.ts` (UI) | Stats Update | Independent rAF | Independent | Manual start/stop. Used for the on-screen stats overlay. |
| `PerformanceMonitor.ts` (Utils) | Frame Violation Tracking | Independent rAF | Independent | Self-managed via `startTracking` / `stopTracking`. |
| `HighTextureCacheDebug.ts` | Profiling/Debug | Independent rAF | Independent | One-off loops used during specific async tests/profiling runs. |
| `GameSpotlight.ts` | Animation | Independent rAF | Independent | Manual start/stop via `startAnimation()` / `stopAnimation()`. |
| `LightingControlsPanel.ts` | UI Throttling | One-shot rAF | Independent | Used to coalesce rapid checkbox updates. |
| `GameLibraryBinderUI.ts` | Focus Preservation | One-shot rAF | Independent | Used to restore focus after re-renders. |

### 2. Analysis of Redundancy & Consolidation

#### Redundant Performance Monitors
There are two classes named `PerformanceMonitor`:
1. `src/ui/PerformanceMonitor.ts`: Handles the visual on-screen stats (FPS/MS/MB).
2. `src/utils/PerformanceMonitor.ts`: Part of the `UnifiedPerformanceMonitor` system. It tracks frame violations and generates JSON reports.

**Recommendation:** The `UnifiedPerformanceMonitor` (`src/utils/PerformanceMonitor.ts`) should be considered the canonical system for performance tracking. The UI component should eventually be refactored to consume data from the unified system rather than running its own rAF loop to calculate FPS.

#### StartupEventTracker Hitch Detector
The hitch detector in `StartupEventTracker.ts` currently stops when the `Interactive` phase ends. 
- **Risk:** The `WorldBuild` phase (which involves heavy instanced mesh creation and shader prewarming) can run concurrently or post-interactive in some startup flows.
- **Finding:** Currently, `phaseEnd(StartupPhase.Interactive)` triggers `stopHitchDetector()`. If hitches occur during the "async encores" (like `PrewarmEncore`), they will be missed.
- **Recommendation:** Keep the hitch detector active until `AppEventTypes.StartupComplete` is emitted, or migrate it to a `RenderLoopRegistry` callback that can be toggled.

#### Registry Candidates (Long-running loops)
The following should be migrated to `RenderLoopRegistry` to benefit from centralized instrumentation and timing:
- `src/debug/GameSpotlight.ts`: The animation loop is a perfect candidate for registry.
- `src/ui/PerformanceMonitor.ts`: If kept independent, it should still register its update pulse.

#### One-shot/Deferred rAF
Usages in `LightingControlsPanel.ts` and `GameLibraryBinderUI.ts` are appropriate as independent one-shots. They are used for DOM/UI synchronization and don't need to be part of the main render loop registry.

### 3. RenderLoopRegistry Utilization
Several systems already correctly use `RenderLoopRegistry`:
- `LodDistanceManager.ts`
- `LodGameArtworkRenderer.ts`
- `SpatialPrewarmingManager.ts`
- `WebXRCoordinator.ts`

### 4. Concrete Recommendations

1. **Unify Performance Monitoring:** Rename `src/ui/PerformanceMonitor.ts` to `PerformanceMonitorUI.ts` to avoid naming collisions. Refactor it to use `UnifiedPerformanceMonitor` as its data source.
2. **Consolidate Animation Loops:** Migrate `GameSpotlight.ts` to use `RenderLoopRegistry` instead of a private rAF.
3. **Extend Hitch Detection:** Update `StartupEventTracker.ts` to keep the hitch detector active through the `PrewarmEncore` phase.
4. **Standardize rAF Usage:** Document that long-running "per-frame" logic should always use `RenderLoopRegistry`, while one-shot DOM fixes (like focus restoration) may use independent rAF.
5. **FrameBudgetScheduler Integration:** Ensure `PerformanceMonitorUI` uses `FrameBudgetScheduler` if it performs expensive UI re-renders, or ensure it respects the `updateInterval` (which it currently does).

---

## Deferred / Future

**Singleton pattern standardization:** Move from static \getInstance()\ + \private static instance\ to ES2022 \#instance\ private field + constructor guard. Makes the singleton contract enforceable at runtime, not just compile time. Do when touching each class, not mass refactor.

**SharedMaterialManager.prewarm() rename:** The name 'prewarm' now conflicts with MeshPrewarmer's shader prewarm concept. Consider \generateTexturesAsync()\ or \kickoffTextureGeneration()\.

**Single wood texture with hue/tint variants:** If final wood look still hitches after visual sign-off, consider generating one base wood texture and applying color matrix transform per material (MdfVeneer vs WallWood) to cut worker time and upload count. Not worth pursuing until the look is finalized.
