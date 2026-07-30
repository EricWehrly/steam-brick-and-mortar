# Plan: Framerate Regression Investigation

**Status**: Dominant cause confirmed and fixed (SSAO/N8AO) — see "Findings (2026-07-29)".
**2026-07-30**: extended into a full re-implementation of the unified "Renderer Quality Preset" —
see "Findings (2026-07-30)" and "Implementation: unified render quality preset" below. A separate
follow-up thread (recurring frame-time spikes noticed while re-measuring) was chased down to Chrome's
own compositor scheduling via a captured DevTools trace and **closed as not app-actionable** — see
"Investigation: recurring frame-time spikes" below. **2026-07-29: doc restructured** — the
capture-tool design and sweep methodology, now built and reusable beyond this one investigation,
moved to [Frame Budget Capture Tooling](../architecture/frame-budget-capture-tooling.md). This doc
keeps the investigation-specific narrative: suspicion, findings, decision, and the fixes that
shipped.
**Priority**: Downgraded from High — the ambient always-on cost that motivated the "High" priority is
fixed, the quality-preset re-implementation is done, and the frame-time-spike thread is closed. What's
left (visual validation, the Advanced-controls stretch goal) is opportunistic, not a dedicated push.
**Related tech debt**: [`shadow-default-policy-evaluation`](../tech-debt.md#id-shadow-default-policy-evaluation)

## Why this doc exists

Unstable/reduced framerate was noticed after the post-processing pipeline and shadow work landed.
The sections below through "The actual signal to chase" record the investigation as originally
scoped, before a root cause was confirmed — kept for the reasoning trail, not because it's still an
open question. See "Findings (2026-07-29)" for what was actually confirmed. See
[Frame-Time Diagnostic Tooling Research](../research/frame-time-diagnostic-tooling-research.md)
for the original tooling survey this investigation was built on.

## What's suspected (unconfirmed)

**"Post-processing" here means the existing pipeline, not a future feature.** A 2026-07-22 code
survey found no `SelectiveBloomEffect` in the codebase — it's still listed as 🔮 Future in
[Post-Processing Effects](../features/postprocessing-effects.md), tied to an unbuilt neon-sign
feature. The pipeline that's actually live and could be the regression source is
`client/src/scene/RenderPipelineManager.ts` (`pmndrs/postprocessing` + `n8ao`): `RenderPass →
N8AOPostPass → EffectPass(ToneMappingEffect AGX) → EffectPass(SMAAEffect, quality-driven preset)`.
Built across several commits: `07f35655` (establish pipeline) → `ec50624d` (SSAO via three
examples) → `c57398a4` (switch to `postprocessing` npm package) → `1280831f` (SMAA notes) →
`37e19737` (replace SSAO with n8ao) → `fcdbf8b2` (fix SSAO blur artifacts on focus loss). No
existing doc or tech-debt entry records a perf-cost measurement for this pipeline — it was never
profiled against a "before" baseline as far as the docs show.

**Shadow work**: two same-day commits (2026-05-10) are the likely regression-window candidates —
`cf67cbda` ("fix(shadows): stabilize shadow pipeline toggles and startup race",
`LightingRenderer.ts` +80/-2, `RoomManager.ts` +14) and `a41e3ef4` ("feat(signage): enable sign
shadow casting and reclassify shading follow-ups", adds `castShadow`/`receiveShadow` to
`SignageRenderer.ts`, `BlockLetterSignRenderer.ts`, `NeonTubeSignRenderer.ts`). These post-date the
postprocessing commits, so if there's a single dominant cause rather than a compounding one,
shadow casting on signage (potentially dozens of sign instances now casting/receiving shadows) is
the more recent change and worth isolating first. Earlier shadow history: `24fa8070` ("shadowmap
is disabled by default"), `6827399d` ("Tier 1+2: Shadow contact grounding").
[`shadow-default-policy-evaluation`](../tech-debt.md#id-shadow-default-policy-evaluation) (the
per-object `castShadow`/`receiveShadow` policy debt) is the same seam — a centralized policy
review, if this investigation confirms shadows as a contributor, could fold naturally into that
existing debt item rather than becoming a second parallel effort.

**Known, separately-tracked, NOT this regression**: `docs/agent-context/performance-metrics.md`
already documents a draw-call increase (~17 → 50-70) attributed to a compositor layer from
`overflow-y: auto` on `.detail-content` in the detail panel — a different, already-diagnosed cause.
Don't re-attribute that one to post-processing/shadows without new evidence. The distinction that
matters for prioritization: the detail-panel issue is **invoked** — it only exists while a user has
opened the detail view, and resolves when it closes. The post-processing/SSAO dive being
investigated here reads as **ambient** — ongoing during regular browsing/traversal, not contingent
on opening anything. An ambient, always-on cost is the higher-priority suspect to instrument first,
since it affects every session rather than one interaction path. The capture tool (see "Tooling and
methodology" below) makes this distinction measurable (idle-scene capture vs. detail-panel-open
capture) rather than assumed.
Two settings get named explicitly as additional suspects below, per the same "which lever costs
what" logic: shadow softness (`shadowQuality`'s `PCFSoftShadowMap`/`VSMShadowMap` switch) and
antialiasing level (`smaaPreset`, and separately hardware MSAA via `msaaLevel`).

## The actual signal to chase: instability, not average fps

Average frame rate is largely a **"match settings to system"** problem — there will always be a
hardware tier where even the floor settings can't hit 60fps, and that's a settings/UX problem, not
a bug. **Frame-time instability is the regression signal actually worth chasing**, because it
persists across capability tiers and points at something structurally uneven rather than "too much
work for this GPU."

**What's actually being observed, corrected 2026-07-28**: not frame-to-frame jitter within a static
scene (that would be surprising on its own — nothing should be doing variable work frame-to-frame
once the app has settled: loading, insertions, and step-by-step GPU/renderer updates are all
one-time costs that finish before "settled"). What's actually reported is a **fluctuating-but-
consistently-low framerate while standing still** — the *average* itself drifts across a session
(one second reads ~45fps, the next ~30, the next ~50) even with a static camera and a fully-settled
scene. That's a different shape than intra-window jitter and needs a different measurement: seeing
it requires **multiple sampled windows across a span**, not one aggregate number for the whole
capture — a single flat average over 10s would smear exactly the pattern that needs to be visible.

This is why the capture tool's report (see "Tooling and methodology" below) surfaces more than
avg/max/peak, which only answer "how expensive," not "how uneven" or "how consistent over time":
- **Per-second bucketing within one capture window**, not repeated `startCapture()`/`report()`
  cycles. Every frame already carries a timestamp relative to capture start; bucket by
  `floor((frameEndTime - captureStart) / 1000)` and report each bucket's avg/stddev/max as a row.
  One 10–15s capture then yields ~10–15 per-second samples in a single `report()` call — "gather up
  at the top of each second," per the request, rather than orchestrating many short windows. This is
  the primary tool for seeing *inter-window drift* (the pattern actually being observed).
- **Frame-time standard deviation**, both overall and per-bucket — the direct instability number,
  useful for confirming whether a bucket's fluctuation is a lot of small variance or one outlier.
- **Frame-to-frame delta** (`|frameTime[n] - frameTime[n-1]|`) and a **jitter-event count** (frames
  whose delta from the previous frame exceeds a threshold, e.g. 4ms) — kept as a secondary metric.
  This catches genuine *intra-window* sawtooth behavior, which is a different (and, per the
  correction above, less expected) failure mode than the drifting-average pattern that's the primary
  target here. Distinct from `slowFrameCount`'s absolute-budget check.

## Tooling and methodology

The capture tool (`RenderLoopDiagnostics.startCapture()`/`report()`, `GpuTimerQuery` for real GPU
timing, per-second bucketing/stddev/jitter for the drifting-average signal above) and the in-session
settings-sweep methodology (settings inventory, benchmark groups, sequencing, execution notes,
commit-vs-throwaway conventions) are documented in full in
**[Frame Budget Capture Tooling](../architecture/frame-budget-capture-tooling.md)** — moved there
2026-07-29 since both are now built, general-purpose, and reusable for isolation sweeps beyond this
one investigation (e.g. the shadow-quality algorithm switch and AA-redundancy sub-sweeps that are
still open, see "Explicitly out of scope" below).

In practice, the tool turned out to be sufficient on its own to find and confirm the dominant cause
directly (see Findings below) — the full benchmark-group sweep described in that doc was never run.
It remains the right methodology for whatever isolation work happens next.

## Findings (2026-07-29)

Diagnosis, not the full sweep — the capture tool (RenderLoopDiagnostics.startCapture()/report(),
GpuTimerQuery) was enough to find and confirm the dominant cause directly, before the settings
sweep matrix was ever run. Captures below: idle scene, default settings unless noted, on a machine
whose display was later found to be power-limited to 60Hz (see the live perf-widget cross-check —
frame time floors out at ~16.7ms even at minimal settings, confirming a 60Hz cap, not a 165Hz one).

1. **The capture tool itself needed a correctness fix before any of this was trustworthy.**
   `avgFrameTime` was originally computed from a CPU-side `performance.now()` span (callback
   execution through `composer.render()` returning), not real frame cadence — `render()` submits
   GPU commands and returns quickly, so this measured submission time, not GPU execution + vsync
   wait. Caught by comparing against the existing perf widget (which measures real rAF-to-rAF
   deltas): tool reported 3.3ms, widget reported 16.8ms. Fixed by threading `RenderLoopRegistry`'s
   already-computed real `deltaTime` through `onBeforeFrame` instead of re-deriving a CPU-work span
   (see the `Fix RenderLoopDiagnostics to measure real frame time` commit). The old CPU-span
   measurement was kept as a separate `avgWorkTime` metric, not discarded — it's still useful
   (“how much of the frame is identifiable CPU work vs. idle/GPU-wait”), just not the same number.
2. **Toggle test isolated SSAO, cleared shadows.** With the fixed tool: baseline (SSAO+shadows on)
   avgFrameTime ≈ 21.0ms. SSAO off → 16.8ms (essentially the floor). Shadows off alone → 20.7ms
   (no meaningful change from baseline). SSAO off + shadows off → 16.7ms (same as SSAO off alone).
   Shadows were never a real contributor here — the earlier suspicion (shadow-casting signage
   commits, see "What's suspected" above) didn't hold up under measurement.
3. **The frame-time distribution is bimodal, not smoothly variable** — a 6s capture with SSAO on
   showed 239 frames at ~16ms (hit vsync) and 60 at ~32–36ms (missed one vsync tick and paid a full
   extra ~16.7ms, not a proportional overrun). This is the actual shape of the "instability" this
   doc set out to chase: SSAO's cost is fairly stable frame-to-frame, but borderline enough that
   ~20% of frames tip over the 16.67ms deadline and pay a full extra vsync interval — not a jittery
   GPU, a threshold effect.
4. **CPU-side `pipeline:n8ao` timing was hiding the real cost.** Added real GPU timing via
   `EXT_disjoint_timer_query_webgl2` (`GpuTimerQuery.ts`, see the GPU-timer-query commit) because
   CPU submission time (~0.8–1.0ms) couldn't possibly explain a ~18ms frame-time/work-time gap.
   Real GPU execution time for N8AO: **~14ms average, ~84.5% of the entire 16.67ms frame budget** —
   a ~17x gap from what CPU timing showed. This fully explains the frame-time/work-time gap and the
   bimodal vsync-miss pattern (SSAO's GPU cost sits right at the edge of the deadline).
5. **Distance-based LOD (the original hypothesis from "What's suspected") doesn't fit how SSAO
   actually works, and was deprioritized before writing any code for it.** SSAO is a full-screen
   post-process pass — cost is driven by pixel count and samples-per-pixel, not scene distance; it
   has no native concept of "near vs. far" the way mesh LOD does. Making it distance-aware would
   mean patching N8AO's shader internals directly: real engineering, real risk, no existing
   precedent in this codebase. Before committing to that, reading N8AO's own source
   (`client/node_modules/n8ao/dist/N8AO.js`) surfaced two already-built, already-shipped levers
   that turned out to matter far more:
   - Our default (`qualityLevel: 'high'`) mapped to N8AO's `setQualityMode('High')`, which sets
     **`aoSamples: 64`** — 4–8x more AO samples per pixel than N8AO's own Medium/Low (16) or
     Performance (8) tiers.
   - N8AO ships a built-in **`halfRes`** mode (half-resolution AO computation + depth-aware
     upsampling) that was simply never turned on.
   - Bonus: N8AO already runs its *own* internal GPU timer query (`pass.lastTime` in its source) —
     worth knowing about for future cross-checks, though `GpuTimerQuery.ts` remains useful as
     general-purpose, reusable instrumentation for other passes.
6. **A/B data across `aoSamples`/`halfRes` combinations** (5s captures each, same idle scene):

   | Config | avgFrameTime | N8AO GPU avg |
   |---|---|---|
   | 64 samples, halfRes off (old default) | 23.2ms | 13.8ms |
   | 16 samples, halfRes off | 15.7ms | 6.4ms |
   | 8 samples, halfRes off | 12.8ms | 5.1ms |
   | 64 samples, halfRes **on** | 12.1ms | 4.5ms |
   | 16 samples, halfRes **on** | 10.5ms | **2.9ms** |

   Dropping to 16 samples alone already pulls frame time under the 16.67ms budget. Combined with
   `halfRes`, N8AO's real GPU cost drops ~4.8x (13.8ms → 2.9ms), landing comfortably under budget
   with real margin — enough to expect the vsync-miss pattern to disappear rather than just shrink.

## Decision: config-level SSAO fix over distance-based LOD

Config-level fix (adjust N8AO's `aoSamples`/`halfRes`) chosen over the distance-based LOD idea:
same or better measured payoff, zero shader/architecture work, uses knobs the library already
ships, no new maintenance surface. The LOD idea is **not discarded** — recorded here as
deprioritized, not rejected, since a full-screen post-process effect was always an awkward fit for
a "distance" concept in the first place. If a future pass needs shadow-specific LOD, that's still
the seam [`shadow-default-policy-evaluation`](../tech-debt.md#id-shadow-default-policy-evaluation)
owns — shadows weren't a contributor here (see Finding 2), so that work stays independently
motivated or not, on its own evidence.

## Implementation: SSAO quality slider

Replaces the old `ssaoEnabled` boolean with `ssaoQuality: number` (index into
`RenderPipelineManager.SSAO_QUALITY_LEVELS`), a `GraphicsSettingsPanel` range slider mirroring the
existing `shadowQualityControl` pattern. Levels, ascending measured GPU cost (**not** a simple
"more samples = higher index" ladder — `halfRes` turned out to matter more than sample count
alone, see Finding 6):

| Index | Label | aoSamples | halfRes | Measured GPU avg |
|---|---|---|---|---|
| 0 | Off | — | — | 0ms |
| 1 (**default**) | 16 samples (half-res) | 16 | on | 2.9ms |
| 2 | 64 samples (half-res) | 64 | on | 4.5ms |
| 3 | 8 samples | 8 | off | 5.1ms |
| 4 | 16 samples | 16 | off | 6.4ms |
| 5 | 64 samples | 64 | off | 13.8ms (old default) |

`denoiseSamples`/`denoiseRadius` are left at N8AO's own defaults across every level — only
`aoSamples`/`halfRes` were varied in testing, so only those are varied here.

**Stretch goal, explicitly deferred** — not part of this implementation: under an "Advanced"
section, expose `aoSamples` and `halfRes` as two independent controls (rather than the combined
6-level slider), and reflect a "Custom" value on the main Graphics slider when the advanced values
don't match one of the six presets. No dependencies blocking it; deferred purely because the
combined slider already delivers the fix and splitting the controls is UI polish, not a
performance question.

**Visual quality not yet verified** — lower AO samples and half-res computation are real quality
trade-offs (more noise, softer contact shadows, less edge precision at object boundaries), offset
by N8AO's own denoise pass by an unmeasured amount. The default (index 1) was chosen on frame-time
data alone; a side-by-side visual comparison against the old default (index 5) is still owed before
calling this fully validated, not just performant.

## Findings (2026-07-30): render-quality-preset settings sweep

Re-measured the remaining settings (`lightingQuality`, `shadowQuality`, `smaaPreset`, `msaaLevel`,
`pixelRatioScale`) to build a real settings-to-preset correlation map for the "Renderer Quality
Preset" selector — see "Implementation: unified render quality preset" below. Driven by
`PerfSweep` (`client/src/debug/PerfSweep.ts`, `?sweep=1`), a self-driving in-page version of the
capture methodology — see [Frame Budget Capture Tooling](../architecture/frame-budget-capture-tooling.md)
for why this exists as a standalone script rather than browser-automation-driven: real `requestAnimationFrame`
cadence requires a genuinely visible, focused tab, which this session confirmed *again* isn't
something browser-automation tooling can force — the sweep needed a human running it in a real
tab. 16 configs, one setting varied at a time against a fixed baseline (current defaults), ~4s
capture each. `ssaoQuality` wasn't re-swept — already measured precisely via `GpuTimerQuery` (see
2026-07-29 Findings above); re-measuring it with this coarser instrument would only add noise.

Results, sorted by cost:

| Setting | avgFrameTime | vs. floor (~16.7ms) |
|---|---|---|
| smaaPreset=low/medium, pixelRatioScale=0.75/1.5/2.0, lightingQuality=advanced, shadowQuality=1/3 | 16.7–16.9ms | floor |
| smaaPreset=ultra, msaaLevel=high, lightingQuality=simple | 17.0–17.1ms | floor |
| baseline (current defaults) | 17.9ms | floor (see caveat) |
| msaaLevel=medium | 17.75ms | floor (see caveat) |
| lightingQuality=ouch-my-eyes | 19.15ms | +13% |
| msaaLevel=ultra (8x) | 20.96ms | +24% |
| **shadowQuality=4 (ultra, PCFSoft→VSM)** | 32.64ms | **+96%** |

Two caveats on this data:
1. **Baseline itself reads anomalously high** — higher than several settings that should cost
   *more*, not less (e.g. `lightingQuality=advanced` at 16.7ms vs. baseline's `enhanced` at
   17.9ms). Baseline was the first capture in the sequence, right after settle; most likely a
   warm-up artifact (shader compilation / texture streaming still catching up), not a real
   per-setting signal. Treated as noise-level (~16.7–17.9ms band), not a precise number.
2. **`pixelRatioScale` showed almost no cost from 0.75 to 2.0** on this machine/viewport —
   surprising, since resolution is usually the largest single lever (see the original settings
   inventory above). Likely this environment's actual framebuffer is small enough that even 2x
   scale isn't hitting a fill-rate wall yet; may not generalize to a larger viewport or different
   hardware. The preset map below still scales `pixelRatioScale` with tier (standard practice) but
   this specific number is unconfirmed, not measured fact.

Everything else replicates the 2026-07-29 findings' shape: one real algorithmic cliff
(`shadowQuality` 3→4, the `PCFSoftShadowMap`→`VSMShadowMap` switch, ~2x — same shape as the SSAO
finding: an algorithm/mode switch costing far more than a resolution increase), one moderate cost
(MSAA 8x, +24%), one mild one (the most dramatic lighting tier, +13%), and everything else sitting
in vsync-floor noise on this hardware.

## Implementation: unified render quality preset

Re-implements the "Renderer Quality Preset" selector (`qualityLevel` in `AppSettings`) as a real
unified dial. Previously `applyQualityPreset()` only touched `shadowMapEnabled` + `pixelRatioScale`
(and Low disabled shadows outright) — everything else the sweep above and the SSAO investigation
measured (`lightingQuality`, `shadowQuality`, `ssaoQuality`, `smaaPreset`, `msaaLevel`) was left at
whatever the user had separately set, so the four options didn't actually correlate with the tiers
their labels implied.

**Four intents**, as specified going in — the map maps settings *to* these, not the reverse:
- **Low** — maximum fps; no feature fully disabled (shadows and SSAO stay on at their cheapest
  non-off level rather than being turned off — a deliberate change from the old Low, which set
  `shadowMapEnabled: false`)
- **Medium** — visual quality with a consistent framerate; every value measured at or near the
  vsync floor
- **High** — visual quality first; framerate can dip
- **Ultra** — maximum visual quality regardless of cost, including the one setting that measured a
  real ~2x jump on its own

`RENDER_QUALITY_PRESETS` in `client/src/core/AppSettings.ts`:

| Setting | Low | Medium | High | Ultra |
|---|---|---|---|---|
| `lightingQuality` | simple | enhanced | advanced | ouch-my-eyes |
| `shadowQuality` | 1 | 2 | 3 | 4 (VSM, the +96% setting) |
| `shadowMapEnabled` | true | true | true | true |
| `ssaoQuality` | 1 (16 samples, half-res) | 2 (64 samples, half-res) | 4 (16 samples, full-res) | 5 (64 samples, full-res) |
| `smaaPreset` | low | medium | high | ultra |
| `msaaLevel` | low | low | high | ultra |
| `pixelRatioScale` | 0.75 | 1 | 1.5 | `window.devicePixelRatio` |

`msaaLevel` skips `medium` entirely (Low and Medium both use `low`/off) — the sweep's medium
reading (17.75ms) was noisier and no cheaper than high (17.04ms), so there was no measured reason
to place it between them; SMAA carries AA duty at Low/Medium instead. `ssaoQuality` doesn't step
through every native level either — indices 1/2/4/5 were picked as the four points that best match
each tier's intent (see the 2026-07-29 SSAO table for the full six-level cost curve); index 3 (8
samples, no half-res) stays available as a manual slider position, just not part of the preset.

Applying a preset (`GraphicsSettingsPanel.applyQualityPreset()`) batches all seven settings through
one `AppSettings.updateSettings()` call — same atomic-apply pattern the sweep methodology itself
depends on — then calls `refreshSettingsDisplay()` so every other control (shadow/SSAO sliders,
lighting/SMAA/MSAA selects) visually reflects the new values immediately, not just on next panel
open. Fixed a pre-existing gap in the process: `refreshSettingsDisplay()` never synced the
`msaa-level` select at all (dead code path since `msaaLevel` shipped) — now it does.

**Not done in this pass** (explicitly deferred, no dependency blocking either):
- Visual comparison of each tier against its old behavior — numbers say cost, not look
- The "Advanced" split-controls / "Custom" indicator stretch goal from the SSAO slider work
  (2026-07-29 Implementation section) — same shape of deferral would apply here too if picked up
- Extending `RENDER_QUALITY_PRESETS` to cover settings outside today's inventory (e.g.
  `environmentIntensity`, `pixelRatioScale`'s interaction with `useLodAtlas`'s LOD distances) —
  scoped to exactly the settings this investigation already measured

## Investigation: recurring frame-time spikes — closed, not app-actionable (2026-07-30)

Follow-up to "Findings (2026-07-30)" above, prompted by noticing frame time still swings hard
second-to-second at both new SSAO settings despite a static camera and a settled scene. Chased with
a live tooling fix, a captured Chrome DevTools Performance trace, and two questions answered directly
from the code — closed with a clear, non-app-code root cause.

### Tooling fix: RenderLoopDiagnostics was flooding its own measurement

`?diagnostics=1` fired a `console.warn` on nearly every frame (the slow-frame check trips often on
hardware running close to its 16.67ms budget) and on every pipeline-stage occurrence over
`callbackTimeWarnThreshold` — thousands of calls per capture, expensive enough on their own to slow
down the very session being measured. Both were already redundant with the periodic summary log and
`report()`'s per-stage breakdown, so the per-occurrence `console.warn` calls were removed entirely
(counts like `slowFrameCount` are still tracked, just not printed per-occurrence). The periodic
auto-log itself (`logStats()`, firing every ~60 frames whether or not anyone asked for it) was
removed outright rather than throttled — it carried no jitter/stddev/bucket data, its "slow frames"
count was lifetime-cumulative shown next to a windowed average, and a single tab-visibility gap could
poison its "peak all-time" number for the rest of the session (observed: "peak all-time:
50342.60ms"). `getStats()`/`report()` already cover everything it did and more; nothing prints
automatically anymore.

A first attempt also added `MAX_PLAUSIBLE_FRAME_TIME_MS` — a sanity ceiling that would silently
exclude any implausibly-large deltaTime (assumed tab-visibility artifact) from every stat. **Reverted
before landing.** Correctly rejected: silently discarding the largest frame-time excursions is
backwards for an investigation trying to find *why* frame time swings — a real stall, not a
tab-visibility gap, is exactly the data point that filter would have hidden. Kept the raw numbers; if
tab-visibility gaps turn out to be a real recurring nuisance later, they need addressing by watching
visibility-change events directly, not by guessing from magnitude.

### The actual spikes, re-measured cleanly

With the spam gone, two 15s captures (`ssaoQuality=2` then `ssaoQuality=1`, the shipped default) via
the console-command workflow showed: per-second bucket **averages are stable** (10.5–11.6ms across
all 15 buckets, both captures — no drift, unlike the 2026-07-29 finding) but several buckets show a
real spike — stddev jumping to 6–7ms, max frame time hitting 25–68ms (5–6x normal) — while
neighboring buckets stay calm. Notably, the *cheaper* SSAO setting (index 1) showed **more and larger
spikes** than the more expensive one (index 2 — 6 spike-buckets vs. 1), ruling out SSAO cost as the
driver: going cheaper made it worse, not better.

### Two questions asked directly, answered from the code

1. **Can vsync be disabled?** No. The installed Three.js version (0.183.2)'s `WebGLRenderer`
   constructor forwards `canvas`, `context`, `depth`, `stencil`, `alpha`, `antialias`,
   `premultipliedAlpha`, `preserveDrawingBuffer`, `powerPreference`, `failIfMajorPerformanceCaveat`,
   `reversedDepthBuffer`, `outputBufferType` — no `desynchronized` support (the one browser hint that
   can reduce vsync-locked presentation latency), and no browser exposes a swap-interval control to
   web content at all. `requestAnimationFrame` cadence *is* the vsync-locked compositor cadence, by
   design, in every browser including Tauri's WebView2. The only way around it would be bypassing the
   webview's rendering for a native GPU surface driven from Tauri's Rust side — a rearchitecture, not
   a setting. Practical consequence: every one of these spikes is "missed N vsync ticks in a row," not
   smoothly-scaling extra work.
2. **Does `HeapMemoryReporter` trigger or encourage GC?** No — it only calls `performance.memory`
   (read-only) every 4,000 frames and logs the delta (`client/src/debug/HeapMemoryReporter.ts`). No
   allocation, no forced collection; V8 decides when to collect entirely on its own. 4,000 frames
   (~44–67s at this framerate) is also far too coarse a sampling interval to correlate with spikes
   recurring every 1–3 seconds — an earlier reference to a heap-size drop as a "lead" was an
   overreach and is retracted here.

### Chrome DevTools Performance trace — the actual answer

A ~14s trace captured during the same steady-state conditions, decompressed and queried directly
(`traceEvents` from the exported `.json.gz`, ~189k events) rather than eyeballed in the DevTools UI,
checked every suspect in turn:

| Suspect | Finding |
|---|---|
| GC (all V8 GC phases) | **Ruled out** — 15.7ms total across the whole ~14s trace, max single event 1.63ms |
| Main-thread JS (`RunTask` on `CrRendererMain`) | **Ruled out** — one 278ms task at the very start (startup/settle, not the steady-state pattern), nothing else over ~27ms anywhere else |
| GPU work (`GPUTask`) | **Ruled out** — max 15.6ms |
| Chrome's compositor pipeline (`PipelineReporter` and its sub-stages) | **This is where the time goes** — median 33ms per frame; `BeginImplFrameToSendBeginMainFrame`, `ReceiveCompositorFrameToStartDraw`, `EndActivateToSubmitCompositorFrame`, and `StartDrawToSwapStart` each independently spike 40–70ms at different moments, no single stage consistently dominant |

None of the spiking stages touch application code — they're internal Chrome compositor/scheduling
steps (vsync tick → ask main thread to start; frame received → wait to rasterize; layer tree ready →
submit to GPU). Which stage spikes moves around between samples rather than pointing at one
deterministic path — the signature of scheduling contention (compositor thread not getting scheduled
promptly) rather than a fixable code path. The pattern was already visible in the non-profiled console
captures too (same shape, no DevTools trace running), so it isn't purely profiler-recording overhead —
real, but outside what SBAM's own code can see or influence, consistent with the vsync finding above
(no lever exists to pull here).

### Conclusion

**Closed as not app-actionable.** Not GC, not application JS, not GPU shader work, not any single
render-pipeline pass, not SSAO. The mechanism is confirmed (vsync misses — no way to disable vsync to
test around it) and the location is confirmed (Chrome's own compositor scheduling, several internal
stages, no consistent single bottleneck), but the cause sits below the web-app layer entirely.
Isolating machine-level contention (closing other apps/tabs and re-profiling) is the only remaining
lever, left as an optional follow-up rather than a next step — see "Explicitly out of scope" below.

## Explicitly out of scope for this doc

- Machine-level contention isolation for the frame-time-spike investigation (closing other
  apps/tabs and re-profiling to see if it's this machine's general load rather than anything about
  the scene) — the compositor-scheduling root cause is confirmed and not app-fixable either way, so
  this is optional curiosity, not follow-up work
- The fixed benchmark-group matrix and floor/ceiling composite captures (see
  [Frame Budget Capture Tooling](../architecture/frame-budget-capture-tooling.md)) — the isolated
  one-setting-at-a-time sweep above answered the preset-map question directly; the composite
  validation captures remain available if the additive-cost assumption ever needs checking.
- The already-diagnosed detail-panel draw-call issue (see "Known, separately-tracked" above)
- Deciding shadow policy centralization — that's `shadow-default-policy-evaluation`'s job; this
  doc found shadows are *not* a contributor here (Finding 2), so no urgency to centralize sooner
- Cross-system extrapolation (deliverable 2) — needs data from more than one machine, not available
  from this sweep
- The "Advanced" split-controls stretch goal (see Implementation sections above)
- Visual quality validation of the new SSAO default and the new quality-preset tiers (see
  Implementation sections above) — numbers say they're the intended cost, nobody's confirmed they
  still look right

## Related

- [Frame Budget Capture Tooling](../architecture/frame-budget-capture-tooling.md) — the capture tool
  and settings-sweep methodology used to reach these findings; the place to look before running any
  further isolation sweep
- [Frame-Time Diagnostic Tooling Research](../research/frame-time-diagnostic-tooling-research.md) — the original tooling survey
- [`shadow-default-policy-evaluation`](../tech-debt.md#id-shadow-default-policy-evaluation)
- `docs/agent-context/performance-metrics.md` — existing targets and known gaps
- `docs/plans/lighting-shadow-refactor-plan.md`
- `docs/features/postprocessing-effects.md`
- `client/node_modules/n8ao/dist/N8AO.js` — N8AO's actual config surface (`aoSamples`, `halfRes`,
  `denoiseSamples`, etc.) and its own built-in GPU timer query (source of Finding 5)
- `client/src/scene/RenderPipelineManager.ts` — `SSAO_QUALITY_LEVELS`, `applySsaoQuality()`,
  `getN8aoConfiguration()` (a kept debug accessor for future console-driven N8AO A/B testing)
- `client/src/debug/PerfSweep.ts` — the self-driving sweep behind `?sweep=1`, source of the
  2026-07-30 findings; kept (not throwaway) since a query-param-triggered sweep needs no external
  driver and this is the second time this investigation has needed one
- `client/src/core/AppSettings.ts` — `RENDER_QUALITY_PRESETS`, the settings-to-preset map itself
- `client/src/ui/pause/panels/GraphicsSettingsPanel.ts` — `applyQualityPreset()`, now the sole
  consumer of `RENDER_QUALITY_PRESETS`
- `client/src/debug/RenderLoopDiagnostics.ts` — no longer prints anything automatically; `getStats()`
  and `startCapture()`/`report()` are the only output paths now (source of the 2026-07-30 tooling fix)
- `client/src/debug/HeapMemoryReporter.ts` — confirmed read-only, doesn't influence GC (2026-07-30)

---
**Signature**: P1
