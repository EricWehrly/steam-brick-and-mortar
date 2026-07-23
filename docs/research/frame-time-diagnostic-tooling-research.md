# Research: Frame-Time Diagnostic Tooling

**Date**: 2026-07-22
**Purpose**: identify the best available tools for breaking down full frame-time impact over a
sampling window, across every environment this project can currently execute in, to support
[Framerate Regression Investigation](../plans/framerate-regression-investigation-plan.md)'s A/B
diagnosis work.

## What already exists in this codebase (start here, don't rebuild it)

- **`RenderLoopDiagnostics`** (`client/src/debug/RenderLoopDiagnostics.ts`) — opt-in via
  `?diagnostics=1`. Hooks `RenderLoopRegistry`'s instrumentation seam (`onBeforeFrame`/
  `wrapCallback`/`onAfterRender`) to time each registered render-loop callback plus full frame
  (callbacks + GPU submission). Tracks rolling averages, all-time peaks, slow-frame counts;
  `window.renderLoopDiagnostics.getStats()` returns `{frameCount, peakFrameTime, slowFrameCount,
  callbackAvgs}`. **This is already a sampling-window frame-time breakdown tool** — the gap isn't
  building a new profiler, it's (a) it currently only sees registered render-loop callbacks, not
  what's inside a single callback (e.g. which composer pass costs what), and (b) nothing
  automates capturing it across an A/B toggle for comparison.
- **`PerformanceObserver` long-task wiring** (same file) — Chrome-only (`longtask` entry type
  unsupported in Firefox). Logs `⚠️ Long task between frames: Xms`.
- **`window.sceneManager.drawCallReport()`** (`client/src/debug/SceneManagerDebug.ts`) — draw
  calls, triangles, geometries, textures, per-object breakdown. Has a Playwright wrapper
  (`client/test/visual/draw-call-report.spec.ts`) but no threshold assertion yet.
- **`PerformanceMonitor.ts`** — always-visible perf widget (live draw-call count).
- **`docs/agent-context/performance-metrics.md`** — the existing target sheet (frame time
  <16.67ms avg, no frame >50ms, ≤20 idle draw calls, etc.) and its own listed gaps: no automated
  draw-call regression test, long-task detection is Chrome-only, no automated VRAM check.

None of this currently attributes cost *within* a frame to a specific pipeline stage (which
composer pass, which shadow map render). That's the actual instrumentation gap this investigation
needs filled — see "Recommended methodology" below.

## Environment landscape

| Environment | CDP/profiler access | Frame-time fidelity | Automation fit |
|---|---|---|---|
| **Chrome (desktop, manual)** | Full DevTools Performance panel, flame charts, `chrome://tracing` | High — real GPU, real compositor | Manual only, but richest single-session inspection |
| **Chrome, driven by Claude / Playwright / Puppeteer** | Full CDP (`Tracing.start`, `Performance` domain) reachable programmatically | High | Best fit for scripted, repeatable A/B capture |
| **Firefox (desktop)** | Firefox Profiler (`about:profiling`), separate from CDP | High, but no `longtask` PerformanceObserver support — `RenderLoopDiagnostics`'s own timing has to carry Firefox entirely | Weaker automation story for this project (no CDP-equivalent already wired) — treat as a manual cross-engine sanity check, not the primary loop |
| **Tauri desktop webview (WebView2)** | WebView2 is Chromium under the hood — **CDP is reachable** if the app is launched with remote debugging enabled, and Tauri's own devtools (right-click → Inspect, or a debug build flag) open real Chromium DevTools | High, and it's the *actual release target* — the only environment giving numbers a user will really experience | Same CDP tooling as browser-Chrome can attach here too, once the debug port is exposed; highest-value target once basic in-app instrumentation exists |
| **Puppeteer in Docker** | CDP reachable, but... | **Low** — Docker Linux containers default to software/SwiftShader WebGL rendering without real GPU passthrough, so frame-time numbers would reflect the container's software rasterizer, not the GPU path every real user runs | Not recommended for frame-time numbers; could still catch outright crashes/functional regressions, just not perf |

The user's own instinct on Puppeteer-in-Docker ("almost certainly won't help") checks out — no
GPU passthrough by default means the numbers wouldn't be representative of anything a real user
sees.

## Recommended methodology

1. **Instrument the suspects with `performance.mark`/`performance.measure`**, not a new external
   tool. Add marks around each `RenderPipelineManager` composer pass (N8AO, tone mapping, SMAA)
   and around shadow-map render passes, then extend `RenderLoopDiagnostics` to surface those
   measures the same way it already surfaces per-callback timing. This works identically in
   Chrome, Firefox, and the Tauri webview — it's the standard Performance API, not
   browser-specific tooling — and answers "which stage costs what" directly, which nothing
   currently built does.
2. **Add a same-session A/B toggle**, not a rebuild-per-variant workflow: a URL flag or console
   function (e.g. `?disablePostprocessing=1`, `?disableShadows=1`, or
   `window.__perfToggle('postprocessing', false)`) that bypasses `RenderPipelineManager`'s
   composer (same pattern as the existing XR direct-render bypass) or forces
   `castShadow`/`receiveShadow` off. Fastest possible iteration loop — same running dev server,
   no rebuild, same scene/library for a controlled comparison.
3. **Capture with Chrome via automation for the fast iteration loop** — CDP tracing driven through
   Claude-in-Chrome/Playwright/Puppeteer gives scripted, repeatable capture (same scene, same
   duration, same machine) far more reliably than manual DevTools clicking. Use this for the
   day-to-day A/B comparisons in the investigation plan.
4. **Validate on the real Tauri desktop build before concluding anything** — since desktop is now
   the primary release target, a fix that only helps in a browser tab isn't confirmed until it's
   also measured in the actual WebView2 shell. Doesn't need to happen every iteration, but should
   gate the final "this fixed it" conclusion.
5. **Use Firefox as a cross-engine sanity check only**, not the primary loop — its lack of
   `longtask` support means `RenderLoopDiagnostics`'s own instrumentation (step 1) is the only
   signal available there, which is fine since that instrumentation doesn't depend on
   browser-specific APIs.
6. **Skip Puppeteer-in-Docker for this work** — reserve Docker-based Puppeteer for functional
   (crash/regression) checks where GPU fidelity doesn't matter, not frame-time measurement.

## What this doesn't answer yet

- Whether WebView2's remote-debugging port is already exposed in this project's Tauri config, or
  needs enabling — not checked as part of this research pass, first task if the Tauri-validation
  step (methodology #4) is picked up.
- The actual root cause — this is a tooling survey, not a diagnosis. See the investigation plan
  for that.

## Related

- [Framerate Regression Investigation Plan](../plans/framerate-regression-investigation-plan.md)
- `docs/agent-context/performance-metrics.md`
- `client/src/debug/RenderLoopDiagnostics.ts`
