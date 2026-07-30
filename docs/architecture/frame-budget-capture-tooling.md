# Architecture: Frame Budget Capture Tooling

**Status**: Built 2026-07-28/29, in active use.
**Built for**: [Framerate Regression Investigation](../plans/framerate-regression-investigation-plan.md) —
this doc covers the tool and how to run a settings sweep with it; that doc covers what's actually
been found and fixed so far.

## Why this exists

"A/B test" was the wrong framing for what actually needed to ship — the goal is a report runnable
from the browser console: start capturing, then ask for a breakdown of what consumed frame time
since capture began. This doc describes that tool and the sweep methodology built around it.

## What already existed vs. what got built

[`RenderLoopDiagnostics`](../research/frame-time-diagnostic-tooling-research.md) already timed
every registered `RenderLoopRegistry` callback individually, keyed by id, with rolling averages and
all-time peaks — `window.renderLoopDiagnostics.getStats()`. **The gap was entirely inside one of
those callbacks.** `SceneManager.startRenderLoop()` calls `renderPipelineManager.render()` directly,
outside any registered callback (`client/src/scene/SceneManager.ts`) — so the entire composer
render (N8AO, tone mapping, SMAA, and the shadow-map pass Three.js runs internally inside
`renderer.render()`) was folded into one opaque "full frame" number.

**Don't build a parallel profiler — and don't hand-roll a second timing/aggregation mechanism
either.** First pass at this design reused `RenderLoopDiagnostics`'s existing `id → timings[]` map
for the new composer-pass and shadow-map instrumentation, which seemed like reuse but wasn't: it
required a second bespoke bookkeeping layer (dedup tracking, capture baselines, custom accumulator
maps) to time things the browser already knows how to time. Some interception point on
`RenderPipelineManager`'s passes and `renderer.shadowMap.render` is unavoidable — nothing in
Three.js/postprocessing/n8ao exposes "which pass cost what," so wrapping is still required — but the
wrapper calls `performance.mark()`/`performance.measure()`, not a custom map.

## The tool

- `RenderPipelineManager`'s four passes (`RenderPass`, `N8AOPostPass`, `EffectPass(ToneMapping)`,
  `EffectPass(SMAA)`) are wrapped via `setPassInstrumentor()`, bracketing each pass's `render()` with
  `performance.mark()`/`performance.measure()`, named `pipeline:renderPass`, `pipeline:n8ao`,
  `pipeline:toneMapping`, `pipeline:smaa`.
- The shadow-map pass is wrapped the same way via `renderer.shadowMap.render` (Three.js calls this
  internally, gated on `renderer.shadowMap.enabled`) as `pipeline:shadowMap`. This measurement is a
  **subset** of `pipeline:renderPass`, not a sibling cost — `RenderPass.render()` calls
  `renderer.render()` internally, which is what triggers the shadow-map pass. Stage totals don't sum
  to the frame total.
- This gets DevTools' Performance panel flame-chart visibility and CDP trace output for free — no
  custom `console.table` formatter needed for that use case.
- All of it is gated behind `RenderLoopDiagnostics.initialize()`'s existing `enabled` flag — wrapping
  only happens when diagnostics are on, preserving "zero overhead when disabled."
- The existing render-loop-callback timing (already `Map`-based, already tested) is unchanged — a
  different concern (in-app rolling stats) from composer/shadow timing (this capture path).

**Frame-time correctness.** `beginFrame(now, deltaTime)` uses `RenderLoopRegistry`'s already-computed
real `deltaTime` (rAF-to-rAF, includes vsync wait) as the frame-time source — not a CPU-side
`performance.now()` span across the render callback, which only measures GPU-command submission
time and badly undercounts real frame cost (see the framerate plan doc's Finding 1 for how this was
caught). The old CPU-span measurement is kept as a separate `avgWorkTime` metric — still useful
("how much of the frame is identifiable CPU work vs. idle/GPU-wait"), just not the same number as
real frame time.

**Real GPU timing.** `client/src/debug/GpuTimerQuery.ts` wraps
`EXT_disjoint_timer_query_webgl2` (`measure(work, onResult)`, `poll()`, `dispose()`, capped at
`MAX_PENDING = 30` pending queries). CPU submission time for a pass can be off from real GPU
execution time by an order of magnitude or more — this is the only way to get the real number.
`RenderLoopDiagnostics.attachRenderPipeline()` creates one from `renderer.getContext()` when WebGL2
is available; `GPU_TIMED_STAGE_IDS` (currently `{'pipeline:n8ao'}`) controls which stages get GPU
timing on top of the mark/measure CPU timing.

### Capture-window API

- `window.renderLoopDiagnostics.startCapture()` — records `performance.now()` as the window start and
  snapshots current cumulative per-id totals as a baseline. Doesn't touch the existing rolling
  `logInterval` window — this is an operator-controlled window with an explicit start.
- `window.renderLoopDiagnostics.report()` — computes elapsed time since `startCapture()`, frame count
  in that window, and for every id (render-loop callbacks from the `Map`, plus `pipeline:*` ids from
  `performance.getEntriesByType('measure')` filtered to entries after capture start) reports
  avg/max/peak/total time and % of average frame budget. Frame-level stats add:
  - **Per-second buckets** (avg/stddev/max each) — the primary tool for seeing *inter-window drift*
    (a session-average that fluctuates second-to-second, not intra-frame jitter). Bucketed by
    `floor((frameEndTime - captureStart) / 1000)`.
  - **Overall standard deviation** — the direct instability number.
  - **Frame-to-frame delta and jitter-event count** — frames whose delta from the previous frame
    exceeds `JITTER_DELTA_THRESHOLD_MS` (4ms). Catches genuine intra-window sawtooth behavior, a
    different failure mode from drifting-average.
  - Long-task count and slow-frame count observed during the window.

  Callable repeatedly without a new `startCapture()` — each call reports "since the last start," so
  an in-progress capture can be checked without ending it. Prints a `console.table` and returns the
  same data as a plain object for scripted comparison.

## Investigation methodology: in-session settings sweep

**Why not CDP-driven A/B toggling.** CDP tracing is the richest single-session inspection tool
available, but for a sweep it costs a human driving each scenario change (slower, error-prone to
keep "same duration, same scene" across many runs) and its output lives in a different format than
this tool's report. The alternative: drive every scenario from inside the running app —
`AppSettings.updateSettings()` already applies a batch of settings atomically and emits one change
event per key — and measure every scenario with the same capture tool. Same session, no reload
between scenarios (except where noted), directly comparable output. CDP/DevTools stay available as a
manual deep-dive once a scenario is flagged interesting, just not the primary loop.

### Settings inventory (what actually affects frame cost)

| Setting | Default | Mechanism | Reactive mid-session? | Suspected impact |
|---|---|---|---|---|
| `lightingQuality` | `enhanced` | `LightingRenderer` light count/type via `LightingEventTypes.QualityChanged` | Yes | Medium — more lights → more shadow-casters |
| `shadowQuality` (0–4) | `2` (medium) | `ShadowPolicy.ts`: map size (512→4096) at 1–3, **shadow-map algorithm switch** `PCFSoftShadowMap`→`VSMShadowMap` at 4 | Yes | Ruled out as a contributor for the current default scene — see framerate plan doc Finding 2. Still worth its own isolation sweep across all 5 levels before calling it fully closed. |
| `shadowMapEnabled` | `true` | `renderer.shadowMap.enabled` | Yes | High (all-or-nothing gate) |
| `ssaoQuality` (0–5) | `1` | `N8AOPostPass.enabled`/`aoSamples`/`halfRes` via `RenderPipelineManager.SSAO_QUALITY_LEVELS` | Yes | **Confirmed dominant cost** — see framerate plan doc Findings 4–6. Fixed via the quality-slider default; levels above the default remain available for users with GPU headroom to spend. |
| `smaaPreset` (low/med/high/ultra) | `high` | `SMAAEffect` rebuild (dispose + recreate) | Yes | Not yet isolated |
| `antialias` (MSAA on the renderer) | `true` | `WebGLRenderer` constructor arg only | **No — genuine WebGL constraint** | Currently **inert in the normal render path** — see MSAA finding below |
| `msaaLevel` (low/med/high/ultra → 0/2/4/8 samples) | `low` (0, off) | `RenderPipelineManager`: `composer.multisampling = N` on init and on setting change | **Yes** | The actual MSAA lever — see finding below. Not yet isolated against `smaaPreset` for redundancy |
| `pixelRatioScale` | `1` | `renderer.setPixelRatio()` | Yes | High — resolution is usually the single biggest lever. Not yet isolated |
| `qualityLevel` | `high` | Drives N8AO's quality mode directly; separately, `GraphicsSettingsPanel.applyQualityPreset()` maps it to `shadowMapEnabled`+`pixelRatioScale` **only when that preset button is explicitly invoked** | Partial/inconsistent | Not a unified dial today — see note below |

**Finding on MSAA, resolved 2026-07-28.** Two separate things were conflated in the first pass at
this table:

1. `WebGLRenderer`'s `antialias` constructor flag really is fixed for the renderer's lifetime — a
   genuine WebGL context-attribute constraint (multisampling on the *default framebuffer* is decided
   at context creation), not something Three.js chose to lock down. It's also currently moot for the
   desktop render path anyway: `RenderPass` renders the scene into `EffectComposer`'s own internal
   render target, not the canvas's default framebuffer (confirmed by reading `pmndrs/postprocessing`'s
   `EffectComposer` source). `antialias: true` only matters in the XR bypass path, which renders
   straight to the default framebuffer.
2. The actual MSAA lever is `EffectComposer.multisampling` — a live setter, no renderer rebuild —
   previously never set (defaulted to `0`). Now wired as `msaaLevel` in `AppSettings.ts`
   (low/medium/high/ultra → 0/2/4/8 samples), read by `RenderPipelineManager` on construction and on
   `AppSettingsEventTypes.Changed`, exposed in `GraphicsSettingsPanel`.
3. No debug accessor needed for the sweep — `msaaLevel` sweeps through
   `AppSettings.updateSettings()` exactly like every other setting in the inventory table.

`smaaPreset` (post-process edge AA) and `msaaLevel` (hardware MSAA on the composer's buffers) are two
independent AA techniques that could in principle stack — still worth testing whether running both
together is redundant/wasteful.

**`qualityLevel` isn't the unified dial its name implies.** It currently only reaches N8AO's quality
mode plus, conditionally, two more settings — it doesn't touch `lightingQuality`, `shadowQuality`, or
`smaaPreset`. The sweep defines its own named presets below rather than stretching `qualityLevel`
before there's data to justify a specific unification.

### Benchmark groups

A fixed 2×2 matrix (tier × post-processing), plus a floor reference and two targeted isolation
sub-sweeps for settings flagged as suspect. Not an exhaustive per-setting matrix — the app isn't
finished, so a full combinatorial sweep would mostly measure things that'll change anyway.

**"Post-processing on/off" means the whole composer bypass** (same technique as the XR direct-render
path — also set `renderer.toneMapping = THREE.AgXToneMapping` when bypassing, same as
`onXrSessionStart()` does, so the comparison isn't confounded by a tone-mapping difference). Within a
"with pp" run, `ssaoQuality` and `smaaPreset` still vary by tier — subtracting pp-off from pp-on at
the same tier gives pp's marginal cost *at that tier*.

| Run | Tier settings | Post-processing |
|---|---|---|
| **Floor** | Everything at its lowest: `lightingQuality=simple`, `shadowMapEnabled=false`, `pixelRatioScale=1` | Bypassed |
| **Basic, no PP** | `lightingQuality=enhanced` (current default), `shadowQuality=1`, `pixelRatioScale=1.5` | Bypassed |
| **Advanced, no PP** | `lightingQuality=advanced`, `shadowQuality=3`, `pixelRatioScale=2` | Bypassed |
| **Basic, with PP** | Same as Basic tier | Composer on, `ssaoQuality=0` (Off), `smaaPreset=low` |
| **Advanced, with PP** | Same as Advanced tier | Composer on, `ssaoQuality=1` (default), `smaaPreset=high` |

The Floor run answers the ceiling question directly: is this system hitting 60fps capped by vsync
with huge headroom, or already struggling at the bottom? That number is the reference every other
run is measured against.

**Targeted isolation sub-sweeps** (drill-downs for settings not yet isolated, not part of the fixed
matrix above):
- **Shadow quality**: run `shadowQuality` at each of 0/1/2/3/4 with everything else held at the
  Advanced tier. Treat 3→4 as its own comparison (algorithm change, see inventory note above), not
  just the next step in the resolution ladder. Lower priority now that Finding 2 ruled shadows out as
  a contributor at the default settings — but the 3→4 algorithm switch specifically hasn't been
  measured.
- **AA level**: run `smaaPreset` at low/medium/high/ultra with everything else held at the Advanced
  tier, then a second pass sweeping `msaaLevel` at low/medium/high/ultra with `smaaPreset` held fixed,
  to see whether the two AA techniques are worth combining or redundant. Both need a **with-PP**
  configuration — both live inside the composer, which doesn't exist when PP is bypassed.

Both sub-sweeps only make sense with shadows/PP actually enabled, so run them against the Advanced
tier rather than Basic or Floor.

### Sequencing a single-session run

1. Load the app, wait for it to reach steady state (`StartupEventTracker`'s "World detail enhanced"
   milestone, not an arbitrary delay) before starting the sweep.
2. Hold the camera in a fixed, idle position for every run in the primary comparison — camera
   movement introduces its own variance (streaming, LOD swaps) that would confound a settings
   comparison. A second "while moving" pass is worth doing later, but only after the idle numbers are
   understood.
3. For each run: apply its settings via one `AppSettings.updateSettings()` call, **wait a settle
   period** (~10s, discarded) before capturing — this excludes one-time costs of the settings change
   itself (SMAA pass dispose/recreate, shadow-map regeneration, N8AO buffer resize) from the
   steady-state numbers. Then `startCapture()`, hold for **5–15s** (one capture, bucketed per-second
   internally), `report()`. If the per-bucket breakdown shows early buckets still noticeably worse
   than later ones, the settle period was too short — extend it and rerun rather than guessing at a
   number up front.
4. A small orchestrator (`runBenchmarkSweep(groups)` or similar, console-invokable) should drive steps
   3–4 across the group list automatically and print a final comparison table across all runs.
5. Write findings back into the framerate plan doc's dated "Findings" section before starting any fix
   — don't jump straight to optimization once a suspect is confirmed; confirm the size of the win
   first.

### Deliverables

1. **Recommended settings for this specific system** — a concrete answer, not just data.
2. **Extrapolation potential for other systems** — flagged explicitly as *not* achievable from a
   single-machine sweep; needs data from more than one machine.
3. **Tuning opportunities in post-processing/other visual components** — concrete tuning targets come
   out of whichever settings the sweep shows as disproportionately expensive relative to their visual
   contribution.

**Labeling settings by comparative cost** in the UI (the way `LIGHTING_QUALITY.ADVANCED` already
carries a descriptive label) is downstream of deliverable 1 — document findings in the plan doc's
Findings section first, only promote specific numbers into settings-menu UI once confirmed.

## Execution notes: autonomous vs. what needs a human

Verified 2026-07-28 via the in-app Browser pane, not assumed:
- **GPU passthrough is real**, not software-rendered: `WEBGL_debug_renderer_info` reported actual
  hardware (`ANGLE (AMD, AMD Radeon RX 780 Graphics ...) Direct3D11`), not a Docker/Puppeteer
  software-rasterizer fallback. Numbers captured through the Browser pane reflect real GPU behavior
  on that machine, not a container fallback — worth re-verifying on whatever environment runs a
  future sweep.
- `window.renderLoopDiagnostics` and `window.AppSettings` are reachable from a single
  `javascript_tool` call immediately after navigating with `?diagnostics=1`.
- **Browser/compositor-level rAF suspension is a real trap.** When a tab/pane isn't actually
  composited (not just scrolled off-screen — genuinely not drawn), `requestAnimationFrame` stops
  firing entirely: 0 calls observed over a 4s window, even after app-level visibility gating was
  fixed. A backgrounded-but-open tab is throttled instead of suspended, but still invalid for real
  numbers — observed ~1.7fps on a tab that wasn't focused. **Only a genuinely focused/visible tab
  gives real numbers.** `FocusCoordinator.keepRunningWhenHidden` (gated on
  `UrlUtils.isDiagnosticsEnabled()`) stops the *app* from pausing the render loop on focus loss, but
  can't override compositor-level suspension — a human keeping the tab actually focused is still
  required for a real capture.

Given that:

**Autonomous**: navigating, applying settings, running `startCapture()`/`report()`, driving the whole
sweep — reading back only the final structured report(s), not polling along the way. Reading
console/network output for functional verification (does the sweep run without errors).

**Needs a human**:
- Judgment calls that need a human read on visuals — "does Basic tier still look acceptable," not
  just "is it fast."
- Tauri desktop-build validation — confirming a recommendation holds on the actual release target,
  not just the browser tab.
- A second machine, if cross-system extrapolation is ever picked up.
- Keeping the capture tab genuinely focused (see rAF suspension note above) — an environment-level
  constraint no amount of app code can work around.
- Confirming the Browser pane's GPU is the one worth measuring — real hardware, but whatever the
  environment exposes, not necessarily the exact machine used for actual play-testing if those
  differ.

**Token efficiency**: drive a sweep as one blocking async call — `await` through settle → capture →
report → next group → final comparison table — rather than polling status across many round trips. A
5-run sweep should be close to one `javascript_tool` exec call returning one JSON result, not
five-plus separate calls.

## Commit vs. throwaway scope

Not everything built for a sweep needs review, tests, or a commit — separating those up front saves
real time, since only committed code needs the usual bar.

**Commit** (general-purpose diagnostic tooling, follows existing patterns, worth keeping):
- `RenderLoopDiagnostics` additions: `attachRenderPipeline()`, mark/measure-based pass
  instrumentation, `startCapture()`/`report()`, per-second bucketing, stddev/jitter, `GpuTimerQuery`.
- `RenderPipelineManager.setPassInstrumentor()` — small, general hook, unit-tested.
- Real `AppSettings` keys with reactive handlers and UI controls (e.g. `msaaLevel`, `ssaoQuality`) —
  these are real settings, not sweep scaffolding, even when a sweep is what surfaces the need for
  them.

**Throwaway** (specific to running one sweep, not meant to outlive it):
- Named preset value objects scoped to one investigation's own benchmark groups (as opposed to a
  real, shipped preset like `RENDER_QUALITY_PRESETS` — see below).
- Ad hoc console snippets for driving individual runs.

**Promoted from throwaway, 2026-07-30**: `client/src/debug/PerfSweep.ts` (behind `?sweep=1`) is the
sweep orchestrator this section originally expected to stay throwaway — promoted once this
investigation needed a second sweep and hit the same browser-automation-can't-drive-it wall (see
"Execution notes" above) a second time. Unlike a `docs/scratch/` script, it's triggered entirely by
URL param and needs no external driver, so a human can run the next sweep by opening a link. Kept
committed and typed; its config list is investigation-specific and expected to change per sweep,
not a stable API.

`docs/scratch/` (untracked) is where investigation-scoped, non-reviewed material already lives. The
orchestrator and presets go there as a plain script, not into `client/src/`.

## Related

- [Framerate Regression Investigation](../plans/framerate-regression-investigation-plan.md) — what
  this tool has found and fixed so far
- [Frame-Time Diagnostic Tooling Research](../research/frame-time-diagnostic-tooling-research.md) —
  the original tooling survey this design is built on
- `docs/agent-context/performance-metrics.md` — general perf metrics reference (draw calls, startup
  timing, memory), separate from this frame-budget-specific tooling
- `client/src/debug/RenderLoopDiagnostics.ts`, `client/src/debug/GpuTimerQuery.ts`
- `client/src/scene/RenderPipelineManager.ts` — `setPassInstrumentor()`, `SSAO_QUALITY_LEVELS`,
  `getN8aoConfiguration()` (a kept debug accessor for console-driven N8AO A/B testing)

---
*A1*
