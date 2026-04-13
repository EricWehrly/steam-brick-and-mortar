# Feature: Key Metrics Instrumentation

**Act**: 2 (Intermission — top priority)
**Status**: Not Started
**Priority**: High

## Goal

Instrument the app with meaningful performance metrics — frame time, memory, time-to-interactive, hitch detection — and surface them in automated Playwright perf reports.

## Context

We have `PerformanceMonitor`, `StartupEventTracker`, and `RenderLoopDiagnostics` but no systematic baseline for frame time, hitch detection, or memory over time. Before Act 2 infrastructure work begins, we need instrumentation so regressions are detectable and improvements are measurable. Playwright perf reports give us a CI-friendly artifact for this.

## Acceptance Criteria

- Frame time tracked per-frame (p50, p95, p99) and logged at session end
- Memory usage sampled periodically (`performance.memory` where available); reported values are annotated with the known discrepancy between JS heap reported by the browser and actual GPU/native memory consumption — do not treat browser-reported figures as ground truth
- Time-to-interactive measured from first user action to first rendered frame with games
- Hitch detection — flag frames exceeding a configurable threshold (e.g. >33ms = hitch at 30fps target); the detection itself ("that frame ran long") is cheap and stays tied to dev mode; **within-frame method timing** (figuring out _what_ in the frame was slow) is the expensive part and must be an explicit opt-in even in dev mode, e.g. via `?profile-frame=1`
- Playwright test produces a perf report artifact (JSON or HTML) capturing the above; Playwright does not have access to true GPU memory figures and its memory numbers reflect the same browser-reported heap — useful as a relative baseline, not an absolute measure
- Metrics exposed in a dev overlay or logged in a structured format for analysis
- No meaningful overhead on production builds (gated behind dev mode or flag)

## Stories / Tasks

- Define metric set and thresholds — agree on hitch threshold, sampling intervals, and what "time-to-interactive" means for this app
- Extend `StartupEventTracker` or create a `PerformanceMetricsCollector` to sample frame time and memory on a timer
- Add hitch detection to `RenderLoopRegistry` callback wrapper
- Wire metrics into a structured log or dev overlay (extend existing `PerformanceMonitor` or `?diagnostics=1` path)
- Playwright perf test — load app, exercise basic navigation, dump perf report artifact

## Notes / Open Questions

- `performance.memory` is Chrome-only and not in the spec; need a graceful fallback for other environments.
- Browser-reported memory and actual memory consumption diverge — GPU allocations, native buffers, and worker memory are invisible to `performance.memory`. The app should surface this discrepancy in its reporting so we don't draw false conclusions. True memory profiling requires browser DevTools or a Playwright trace with heap snapshots; a future spike into Playwright-based heap profiling is worth considering but is not in scope for this feature.
- Hitch detection requires care: **detecting** that a frame ran long is cheap and appropriate for dev mode. **Instrumenting individual methods within a frame** to find the offender is inescapably expensive and must be an explicit opt-in (e.g. `?profile-frame=1` URL param or a dedicated dev overlay toggle) — never on by default, even in dev mode.
- Playwright perf reports: consider whether these go into `playwright-report/` alongside visual snapshots, or into a dedicated `perf-report/` artifact directory.
- Keep this lightweight — the goal is a baseline, not a full APM stack.
