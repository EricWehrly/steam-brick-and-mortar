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
- Memory usage sampled periodically (`performance.memory` where available)
- Time-to-interactive measured from first user action to first rendered frame with games
- Hitch detection — flag frames exceeding a configurable threshold (e.g. >33ms = hitch at 30fps target)
- Playwright test produces a perf report artifact (JSON or HTML) capturing the above
- Metrics exposed in a dev overlay or logged in a structured format for analysis
- No meaningful overhead on production builds (gated behind dev mode or flag)

## Stories / Tasks

- Define metric set and thresholds — agree on hitch threshold, sampling intervals, and what "time-to-interactive" means for this app
- Extend `StartupEventTracker` or create a `PerformanceMetricsCollector` to sample frame time and memory on a timer
- Add hitch detection to `RenderLoopRegistry` callback wrapper
- Wire metrics into a structured log or dev overlay (extend existing `PerformanceMonitor` or `?diagnostics=1` path)
- Playwright perf test — load app, exercise basic navigation, dump perf report artifact

## Notes / Open Questions

- `performance.memory` is Chrome-only and not in the spec; need a graceful fallback.
- Consider whether perf reports go into `playwright-report/` alongside visual snapshots.
- Keep this lightweight — the goal is a baseline, not a full APM stack.
