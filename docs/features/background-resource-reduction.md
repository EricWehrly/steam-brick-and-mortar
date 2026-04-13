# Feature: Background Resource Reduction

**Act**: 2 (Intermission)
**Status**: Not Started
**Priority**: Medium

## Goal

Reduce GPU and CPU usage when the browser tab is in the background using the Page Visibility API, LOD system, and frame rate throttling.

## Context

The app currently renders at full rate even when the tab is hidden. This wastes battery and GPU on a machine where the user has moved on. The LOD system already exists and can be leveraged — we just need to hook Page Visibility events to disable high-detail LOD levels and throttle the render loop when not in focus. This is a quick win with low risk.

## Acceptance Criteria

- App detects `visibilitychange` events via Page Visibility API
- When hidden: render loop throttles to a low tick rate (e.g. 1fps or paused entirely)
- When hidden: LOD system drops to lowest detail level across all instanced geometry
- When visible again: LOD and frame rate restore to normal within one frame
- No perceptible hitch or visual glitch on tab re-focus
- Behavior verified manually and ideally with a test

## Stories / Tasks

- Hook `document.addEventListener('visibilitychange', ...)` in app startup (or a new `VisibilityCoordinator`)
- When hidden: call existing LOD API to force lowest tier; throttle `RenderLoopRegistry` tick rate
- When visible: restore LOD and tick rate
- Test: simulate visibility change and verify render loop behavior

## Notes / Open Questions

- Check whether `RenderLoopRegistry` has a mechanism to throttle tick rate; may need a simple `setTimeout`-based fallback loop instead of `requestAnimationFrame` when hidden.
- Page Visibility API has broad browser support — no polyfill needed.
- Don't fully pause audio or other time-sensitive systems without explicit design decision.
