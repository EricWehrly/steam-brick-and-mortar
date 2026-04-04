# Startup Instrumentation Plan

## Goal
Measure and report the exact time taken by each of the 5 formalized startup phases, plus specifically flag UI-blocking hitches (main thread freezes). Establish thresholds where we warn/fail if startup gets too slow.

## Current State
We already have `StartupEventTracker.ts` which tracks `StartupPhase` enums, but:
1. The enums don't match the new 5-phase `docs/agent-context/startup-sequence.md` architecture.
2. It's tightly coupled to `StartupProgressUI.ts` (it directly imports and mutates it).
3. It doesn't actively measure main-thread blocking time (just wall-clock duration).
4. The output is a single console log at the very end (`Startup complete: Xms`).

## Proposed Implementation

### 1. Align Enums to Architecture
Update `StartupPhase` in `StartupEventTracker.ts` to exactly match our 5 architectural phases:
- `CoreInit`
- `EngineStart`
- `WorldBuild`
- `ControlsReady`
- `Interactive`

And add the two async post-events:
- `PrewarmEncore`
- `DataFetchEncore`

### 2. Decouple from UI
`StartupEventTracker` should emit standard events via `EventManager` (e.g., `AppEventTypes.PhaseCompleted`).
`StartupProgressUI` should listen to those events to update itself. The tracker shouldn't know the UI exists.

### 3. Add Threshold Warnings
Add a configuration to the tracker:
```ts
const PHASE_THRESHOLDS_MS = {
  [StartupPhase.CoreInit]: { warn: 50, error: 200 },
  [StartupPhase.EngineStart]: { warn: 500, error: 1000 },
  [StartupPhase.WorldBuild]: { warn: 2000, error: 5000 }, // This is where the 2900ms shader freeze happens
  [StartupPhase.ControlsReady]: { warn: 100, error: 500 },
}
```
If a phase exceeds `warn`, it logs `console.warn()`. This makes it immediately visible in Playwright console capture tools.

### 4. Implement "Hitch" Detection
To detect if the 2900ms in WorldBuild is *blocking the main thread* (a freeze) vs just async background work, we can run a simple `requestAnimationFrame` heartbeat during startup. If the gap between two rAF ticks exceeds 100ms, we log a "Main Thread Hitch Detected: Xms" warning.

### 5. Playwright Integration
By having the tracker emit `console.table(phaseMetrics)` or structured warnings, our existing Playwright `console-logs.spec.ts` tool will automatically capture the exact phase durations and hitches on every CI run or local test.

## Execution Order
1. Update `StartupPhase` enum to match the 5-phase doc.
2. Wire `SteamBrickAndMortarApp.ts` to start/stop the new phases at the correct boundaries.
3. Decouple the UI update logic into event listeners.
4. Add the threshold warnings and rAF hitch detector.
5. (Follow-up feature) Tackle the `shader-prewarm-plan.md` to actually fix the hitch we just instrumented.