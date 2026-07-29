# Plan: Framerate Regression Investigation

**Status**: Capture tool + settings-sweep methodology designed, not yet built — no measurement or root cause confirmed yet
**Priority**: High — parallel track alongside [Input System](../features/input-system.md); no hard
dependency between the two, safe to run concurrently
**Related tech debt**: [`shadow-default-policy-evaluation`](../tech-debt.md#id-shadow-default-policy-evaluation)

## Why this doc exists

Unstable/reduced framerate was noticed after the post-processing pipeline and shadow work landed.
No root cause has been confirmed yet — this doc is the investigation plan, not a diagnosis. See
[Frame-Time Diagnostic Tooling Research](../research/frame-time-diagnostic-tooling-research.md)
for what to measure with before drawing conclusions.

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
since it affects every session rather than one interaction path. The capture tool below should make
this distinction measurable (idle-scene capture vs. detail-panel-open capture) rather than assumed.
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

This changes what the capture tool's report needs to surface, beyond avg/max/peak (already designed
above, which answers "how expensive," not "how uneven" or "how consistent over time"):
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

## Frame-budget capture tool (build this first)

"A/B test" was the wrong framing for what actually needs to ship here — the goal is a report
runnable from the browser console: start capturing, then ask for a breakdown of what consumed
frame time since capture began. This section designs that tool; methodology below is what gets run
once it exists.

**What already exists** (full detail in the
[research doc](../research/frame-time-diagnostic-tooling-research.md)): `RenderLoopDiagnostics`
already times every registered `RenderLoopRegistry` callback individually, keyed by id, with
rolling averages and all-time peaks — `window.renderLoopDiagnostics.getStats()`. **The gap is
entirely inside one of those callbacks.** `SceneManager.startRenderLoop()` calls
`renderPipelineManager.render()` directly, outside any registered callback
(`client/src/scene/SceneManager.ts:188`) — so the entire composer render (N8AO, tone mapping, SMAA,
*and* the shadow-map pass Three.js runs internally inside `renderer.render()`) is currently folded
into the single opaque "full frame" number `endFrame()` reports. Nothing today says which of those
four costs what.

**Don't build a parallel profiler — and don't hand-roll a second timing/aggregation mechanism
either.** First pass at this design reused `RenderLoopDiagnostics`'s existing `id → timings[]` map
for the new composer-pass and shadow-map instrumentation, which seemed like reuse but wasn't: it
required a second bespoke bookkeeping layer (dedup tracking, capture baselines, custom accumulator
maps) to time things the browser already knows how to time. Some interception point on
`RenderPipelineManager`'s passes and `renderer.shadowMap.render` is unavoidable — nothing in
Three.js/postprocessing/n8ao exposes "which pass cost what," so wrapping is still required — but the
wrapper should call `performance.mark()`/`performance.measure()`, not feed a custom map:

- Instrument `RenderPipelineManager`'s four passes (`RenderPass`, `N8AOPostPass`,
  `EffectPass(ToneMapping)`, `EffectPass(SMAA)`) by wrapping each pass's `render()` method to bracket
  the call with `performance.mark()`/`performance.measure()`, named e.g. `pipeline:n8ao`,
  `pipeline:toneMapping`, `pipeline:smaa`.
- Instrument the shadow-map pass the same way by wrapping `renderer.shadowMap.render` (Three.js
  calls this internally, gated on `renderer.shadowMap.enabled` — see `LightingRenderer.ts`) as
  `pipeline:shadowMap`. Note this measurement is a **subset** of `pipeline:renderPass`, not a
  sibling cost — `RenderPass.render()` calls `renderer.render()` internally, which is what triggers
  the shadow-map pass. Don't sum stage totals expecting them to equal the frame total.
- This gets DevTools' Performance panel flame-chart visibility and CDP trace output *for free* —
  no custom `console.table` formatter needed for that use case. It's also literally what the
  [research doc](../research/frame-time-diagnostic-tooling-research.md) already recommended; the
  first implementation pass drifted from that without a reason to.
- Gate all of this behind the existing `enabled` flag in `RenderLoopDiagnostics.initialize()` — the
  wrapping only happens when diagnostics are on, preserving the "zero overhead when disabled"
  property the module already guarantees. Needs `RenderPipelineManager` to expose its passes and
  the renderer's shadow map to the diagnostics module at `initialize()` time (an accessor, not a
  new dependency direction — diagnostics still only reads, doesn't drive rendering).
- The existing render-loop-callback timing (already `Map`-based, already working, already tested)
  stays as-is — not worth migrating to marks/measures too. Two mechanisms *within this file* would
  be a real duplication problem; that's different from the render-loop callbacks legitimately being
  a different concern (in-app rolling stats) from composer/shadow timing (this new capture path).

**New capture-window API** (two calls, matching what was asked for):

- `window.renderLoopDiagnostics.startCapture()` — records `performance.now()` as the window start
  and snapshots current cumulative per-id totals as a baseline. Doesn't touch the existing rolling
  `logInterval` window (that's a different, auto-resetting concern) — this is an
  operator-controlled window with an explicit start.
- `window.renderLoopDiagnostics.report()` — computes elapsed time since `startCapture()`, frame
  count in that window, and for every id — existing render-loop callbacks (from the `Map`) and the
  new `pipeline:*` ids (queried from `performance.getEntriesByType('measure')`, filtered to entries
  timestamped after capture start) — reports avg/max/peak/total time **and % of average frame
  budget**. Frame-level stats add **per-second buckets (avg/stddev/max each) plus overall standard
  deviation and jitter-event count** (see "instability" above) — that's the part a raw browser trace
  doesn't hand you pre-computed, and the buckets are what actually show a drifting average across a
  single static-camera capture. Also rolls in the long-task count and slow-frame count observed
  during the window (already collected, just not currently aggregated over an arbitrary span).
  Callable repeatedly without a new `startCapture()` — each call reports "since the last start," so
  an in-progress capture can be checked without ending it. Prints a `console.table` for readability
  (one row per bucket, plus a summary row) and returns the same data as
  a plain object for scripted comparison and for the sweep orchestrator below.

This gives one report per capture window, comparable across runs — same tool, same output shape,
every time, instead of eyeballing console spam or hand-correlating a separate CDP trace against it.

## Investigation methodology: in-session settings sweep

**Why not CDP-driven A/B toggling.** CDP tracing is the richest single-session inspection tool
available (per the research doc), but for this investigation it has two costs: it needs a human
driving each scenario change (slower, and error-prone to keep "same duration, same scene" across
many runs), and its output lives in a different data format than the in-app capture tool's report —
comparing them means manually overlaying two different sources rather than diffing one. The
alternative: drive every scenario from inside the running app — `AppSettings.updateSettings()`
already applies a batch of settings atomically and emits one change event per key — and measure
every scenario with the same capture tool. Same session, no reload between scenarios (except where
noted below), directly comparable output because it's the same instrument every time. CDP/DevTools
stay available as a manual deep-dive once a scenario is flagged interesting, just not the primary
loop.

### Settings inventory (what actually affects frame cost)

| Setting | Default | Mechanism | Reactive mid-session? | Suspected impact |
|---|---|---|---|---|
| `lightingQuality` | `enhanced` | `LightingRenderer` light count/type via `LightingEventTypes.QualityChanged` | Yes | Medium — more lights → more shadow-casters |
| `shadowQuality` (0–4) | `2` (medium) | `ShadowPolicy.ts`: map size (512→4096) at 1–3, **shadow-map algorithm switch** `PCFSoftShadowMap`→`VSMShadowMap` at 4 | Yes | High — flagged suspect (soft shadows). The 3→4 jump changes *algorithm*, not just resolution — treat it as a separate isolation point, not another rung on the same ladder |
| `shadowMapEnabled` | `true` | `renderer.shadowMap.enabled` | Yes | High (all-or-nothing gate) |
| `ssaoEnabled` | `true` | `N8AOPostPass.enabled` | Yes | High — flagged suspect (SSAO/n8ao) |
| `smaaPreset` (low/med/high/ultra) | `high` | `SMAAEffect` rebuild (dispose + recreate) | Yes | Flagged suspect (AA) |
| `antialias` (MSAA on the renderer) | `true` | `WebGLRenderer` constructor arg only | **No — genuine WebGL constraint** | Currently **inert in the normal render path** — see finding below |
| `msaaLevel` (low/med/high/ultra → 0/2/4/8 samples) | `low` (0, off) | `RenderPipelineManager`: `composer.multisampling = N` on init and on setting change | **Yes** | The actual MSAA lever — see finding below |
| `pixelRatioScale` | `1` | `renderer.setPixelRatio()` | Yes | High — resolution is usually the single biggest lever |
| `qualityLevel` | `high` | Drives N8AO's quality mode directly; separately, `GraphicsSettingsPanel.applyQualityPreset()` maps it to `shadowMapEnabled`+`pixelRatioScale` **only when that preset button is explicitly invoked** | Partial/inconsistent | Not a unified dial today — see note below |

**Finding on MSAA, resolved 2026-07-28.** Two separate things were conflated in the first pass at
this table:

1. `WebGLRenderer`'s `antialias` constructor flag really is fixed for the renderer's lifetime — this
   part holds. It's a genuine WebGL context-attribute constraint (multisampling on the *default
   framebuffer* is decided at context creation), not something Three.js chose to lock down. It's
   also **currently moot for the desktop render path anyway**: `RenderPass` renders the scene into
   `EffectComposer`'s own internal render target, not the canvas's default framebuffer — confirmed by
   reading `pmndrs/postprocessing`'s `EffectComposer` source
   (`client/node_modules/postprocessing/build/index.cjs`). `antialias: true` only matters in the XR
   bypass path, which renders straight to the default framebuffer.
2. The actual MSAA lever is `EffectComposer.multisampling` — a live setter
   (`composer.multisampling = value`, no renderer rebuild), previously never set (defaulted to `0`).
   **Now wired as a real, reactive setting** — `msaaLevel` in `AppSettings.ts`
   (low/medium/high/ultra → 0/2/4/8 samples, same shape as `smaaPreset`), read by
   `RenderPipelineManager` on construction and on `AppSettingsEventTypes.Changed`, exposed in
   `GraphicsSettingsPanel` as "Anti-Aliasing (MSAA)" right next to the existing "Anti-Aliasing
   (SMAA)" control (the likely source of the original mix-up — both read as "the AA setting" even
   though they're independent techniques with independent costs). Verified against the real
   `EffectComposer` instance in the running app, not just unit-test mocks: setting the value through
   `AppSettings` round-trips cleanly with no console errors. Default (`low` → 0 samples) preserves
   prior behavior, so this isn't a behavior change for existing sessions.
3. No debug accessor needed for the sweep after all — `msaaLevel` sweeps through
   `AppSettings.updateSettings()` exactly like every other setting in the inventory table.

`smaaPreset` (post-process edge AA) and `msaaLevel` (hardware MSAA on the composer's buffers) are
two independent AA techniques that could in principle stack — worth testing whether running both
together is redundant/wasteful before recommending any combination.

**`qualityLevel` isn't the unified dial its name implies.** It currently only reaches N8AO's quality
mode plus, conditionally, two more settings — it doesn't touch `lightingQuality`, `shadowQuality`,
or `smaaPreset`. Rather than stretch it to cover the sweep's groups (which would mean changing its
real behavior before we have data to justify a specific unification), the sweep defines its own
named presets below, scoped to benchmarking. Whether to fold the eventual recommendation back into
`qualityLevel` becomes deliverable 1 below, once there's a recommendation to fold in.

### Benchmark groups

A fixed 2×2 matrix (tier × post-processing), plus a floor reference and two targeted isolation
sub-sweeps for the settings already flagged as suspect. Not an exhaustive per-setting matrix —
per the "if both contribute, quantify each independently" principle, but bounded: the app isn't
finished, so a full combinatorial sweep would mostly measure things that'll change anyway.

**"Post-processing on/off" means the whole composer bypass** (same technique as the existing XR
direct-render path — remember to also set `renderer.toneMapping = THREE.AgXToneMapping` when
bypassing, same as `onXrSessionStart()` does, so the comparison isn't confounded by a tone-mapping
difference). Within a "with pp" run, `ssaoEnabled` and `smaaPreset` still vary by tier — that's
what makes each tier's pp-on vs. pp-off pair useful: subtracting one from the other gives pp's
marginal cost *at that tier*, not just pp's cost in isolation.

| Run | Tier settings | Post-processing |
|---|---|---|
| **Floor** | Everything at its lowest: `lightingQuality=simple`, `shadowMapEnabled=false`, `pixelRatioScale=1` | Bypassed |
| **Basic, no PP** | `lightingQuality=enhanced` (current default), `shadowQuality=1`, `pixelRatioScale=1.5` | Bypassed |
| **Advanced, no PP** | `lightingQuality=advanced`, `shadowQuality=3`, `pixelRatioScale=2` | Bypassed |
| **Basic, with PP** | Same as Basic tier | Composer on, `ssaoEnabled=false`, `smaaPreset=low` |
| **Advanced, with PP** | Same as Advanced tier | Composer on, `ssaoEnabled=true`, `smaaPreset=high` |

The Floor run answers the ceiling question directly: is this system hitting 60fps capped by vsync
with huge headroom (frame time closer to 10ms than 16), or already struggling at the bottom? That
number is the reference every other run is measured against.

**Targeted isolation sub-sweeps** (drill-downs for the two specifically-flagged settings, not part
of the fixed matrix above):
- **Shadow quality**: run `shadowQuality` at each of 0/1/2/3/4 with everything else held at the
  Advanced tier. Treat 3→4 as its own comparison (algorithm change, see inventory note above), not
  just the next step in the resolution ladder.
- **AA level**: run `smaaPreset` at low/medium/high/ultra with everything else held at the Advanced
  tier, then a second pass sweeping `msaaLevel` at low/medium/high/ultra (via `AppSettings`, same as
  every other setting — see MSAA finding above) with `smaaPreset` held fixed, to see whether the two
  AA techniques are worth combining or redundant. Both need a **with-PP** configuration — both live
  inside the composer, which doesn't exist when PP is bypassed.

Both sub-sweeps only make sense with shadows/PP actually enabled, so run them against the Advanced
tier rather than Basic or Floor.

### Sequencing a single-session run

1. Load the app, wait for it to reach steady state (`StartupEventTracker`'s "World detail enhanced"
   milestone, not an arbitrary delay) before starting the sweep.
2. Hold the camera in a fixed, idle position for every run in the primary comparison — camera
   movement introduces its own variance (streaming, LOD swaps) that would confound a settings
   comparison. A second "while moving" pass is worth doing later, but only after the idle numbers
   are understood, so movement-driven variance doesn't get misattributed to a settings change.
3. For each run: apply its settings via one `AppSettings.updateSettings()` call, **wait a settle
   period** (~10s, discarded) before capturing — this excludes one-time costs of the settings
   change itself (SMAA pass dispose/recreate, shadow-map regeneration, N8AO buffer resize) from the
   steady-state numbers. Then `startCapture()`, hold for **5–15s** (one capture, bucketed per-second
   internally per the instability section above — not multiple separate windows), `report()`. If the
   per-bucket breakdown shows the early buckets still noticeably worse than later ones, the settle
   period was too short — extend it and rerun rather than guessing at a number up front.
4. A small orchestrator (`runBenchmarkSweep(groups)` or similar, console-invokable) should drive
   steps 3–4 across the group list automatically and print a final comparison table across all runs
   — this is the "decent way to capture them sequentially and for comparison" this section exists
   to answer. Build this alongside the capture tool, not as a separate follow-up: without it the
   sweep is back to manual, error-prone driving, which is exactly what step "why not CDP" above is
   trying to avoid.
5. **Write findings back into this doc** (a dated "Findings" section) before starting any fix —
   don't jump straight to optimization once a suspect is confirmed; confirm the size of the win
   first.

### Deliverables

1. **Recommended settings for this specific system** — a concrete answer, not just data. If the
   Floor run shows a big ceiling above 16.67ms, that headroom is available to spend somewhere;
   the sweep says where it's cheapest to spend it.
2. **Extrapolation potential for other systems** — flagged explicitly as *not* achievable from a
   single-machine sweep; recording it now so it isn't lost, but it needs data from more than one
   machine before it's a real deliverable. Out of scope for this pass.
3. **Tuning opportunities in post-processing/other visual components** — feeds the LOD-normalization
   hypothesis below; concrete tuning targets come out of whichever settings the sweep shows as
   disproportionately expensive relative to their visual contribution.

**Labeling settings by comparative cost** (e.g. annotating `GraphicsSettingsPanel`'s
`LIGHTING_QUALITY.ADVANCED` option with its relative GPU cost, the way it already carries a
descriptive label) is a good idea but explicitly downstream of deliverable 1 — there's no cost data
to label with yet. Document findings internally first (this doc's dated Findings section); only
promote specific numbers into the settings-menu UI once they're confirmed, not speculative.

## Execution: what runs autonomously vs. what needs you

Verified 2026-07-28 via the in-app Browser pane, not assumed:
- **GPU passthrough is real**, not software-rendered: `WEBGL_debug_renderer_info` reports
  `ANGLE (AMD, AMD Radeon RX 780 Graphics ...) Direct3D11`, i.e. actual hardware — not the
  Docker/Puppeteer software-rasterizer situation the research doc already warned about. Numbers
  captured through this Browser pane reflect real GPU behavior on this machine, not a container
  fallback.
- `window.renderLoopDiagnostics` and `window.AppSettings` are reachable from a single
  `javascript_tool` call immediately after navigating with `?diagnostics=1` — confirmed live against
  the running dev server.

Given that:

**Autonomous**: navigating, applying settings, running `startCapture()`/`report()`, and driving the
whole sweep — reading back only the final structured report(s), not polling along the way. Reading
console/network output for functional verification (does the sweep run without errors).

**Needs you**:
- Judgment calls that need a human read on visuals — "does Basic tier still look acceptable," not
  just "is it fast." Numbers are reportable; whether a setting change is a visually acceptable
  trade-off isn't something I can assess.
- The Tauri desktop-build validation the research doc's step 4 calls for — confirming the final
  recommendation holds on the actual release target, not just the browser tab. Nothing here drives
  that build.
- A second machine, if deliverable 2 (cross-system extrapolation) is ever picked up.
- Confirming this Browser pane's GPU is the one worth measuring — it's real hardware, but it's
  whatever this environment exposes, not necessarily the exact machine you play-test on if those
  differ.

**Token efficiency**: drive the sweep as one blocking async call — `await` through settle → capture
→ report → next group → final comparison table — rather than polling status across many round
trips. A 5-run sweep should be close to one `javascript_tool` exec call returning one JSON result,
not five-plus separate calls.

## Commit vs. throwaway scope

Not everything built for this investigation needs review, tests, or a commit — separating those
up front saves real time, since only committed code needs the usual bar.

**Commit** (general-purpose diagnostic tooling, follows existing patterns, worth keeping after this
investigation closes):
- `RenderLoopDiagnostics` additions: `attachRenderPipeline()`, mark/measure-based pass
  instrumentation, `startCapture()`/`report()`, per-second bucketing, stddev/jitter.
- `RenderPipelineManager.setPassInstrumentor()` — small, general hook, already unit-tested.
- `msaaLevel` — **done, 2026-07-28**: real `AppSettings` key, `SettingCategory.Graphics` member,
  reactive `RenderPipelineManager` handler (`composer.multisampling`), `GraphicsSettingsPanel` UI
  control, unit-tested, verified live. Not deferred — turned out to be a real gap (a graphics
  setting with no UI/AppSettings backing at all, unlike `antialias` which at least had the
  `AppSettings` key even though it can't be reactive), and small enough to fix immediately rather
  than schedule for later.

**Throwaway** (specific to running this investigation once, not meant to outlive it):
- The named preset value objects (Floor/Basic/Advanced settings bundles) — investigation-specific
  numbers, not a real feature.
- The sweep orchestrator itself (`runBenchmarkSweep` or equivalent) — glue to drive a one-time
  investigation. If it turns out worth keeping as an ongoing regression-testing tool, that's a
  deliberate follow-up decision once we've seen whether it's worth maintaining, not a default.
- Ad hoc console snippets for driving individual runs.

This repo already has a convention for exactly this: `docs/scratch/` (untracked) is where
investigation-scoped, non-reviewed material already lives. The orchestrator and presets go there as
a plain script, not into `client/src/`.

## Candidate mitigation direction (flagged, not in scope for this doc)

If the capture tool confirms SSAO and/or shadows as a dominant, ambient cost: both currently only
have a *global* quality knob (`shadowQuality` in `LightingRenderer.ts`, N8AO's
`setQualityMode()`/`QUALITY_LEVEL` in `RenderPipelineManager.ts`) — one setting, applied uniformly
regardless of what's actually in view or how far it is from the camera. There's no distance- or
importance-based LOD that reduces cost for, say, signage far from the player or outside the AO
radius's useful range. Worth considering once contribution is confirmed: could shadow-casting and
AO sampling fall off with distance/relevance the way a mesh LOD would, to "normalize" the per-frame
cost instead of paying the same rate everywhere all the time. This is a fix-direction hypothesis to
record now so it isn't lost — not a design to implement here (see "Explicitly out of scope" below)
— and it's the same seam as
[`shadow-default-policy-evaluation`](../tech-debt.md#id-shadow-default-policy-evaluation), so if
adopted it should fold into that debt item's centralized-policy work rather than becoming a third
parallel shadow/AO mechanism.

## Explicitly out of scope for this doc

- Actually implementing a fix to the regression itself (e.g. disabling/re-tuning shadows or SSAO,
  building the LOD idea above) — this doc stops at diagnosis and a recommended next step. Building
  the capture tool and the sweep orchestrator is in scope; it's instrumentation, not a change to
  render behavior.
- The already-diagnosed detail-panel draw-call issue (see "Known, separately-tracked" above)
- Deciding shadow policy centralization — that's `shadow-default-policy-evaluation`'s job; this
  doc only decides whether shadows are *a* contributor worth centralizing sooner
- Cross-system extrapolation (deliverable 2) — needs data from more than one machine, not available
  from this sweep
- Unifying `qualityLevel` into a single dial that actually drives every setting in the inventory
  table — a plausible destination for deliverable 1's recommendation, but not a prerequisite for
  running the sweep, and premature before there's a recommendation to unify around
- Promoting comparative-cost labels into `GraphicsSettingsPanel`'s UI — downstream of deliverable 1,
  once numbers exist to label with

## Related

- [Frame-Time Diagnostic Tooling Research](../research/frame-time-diagnostic-tooling-research.md) — what to measure with
- [`shadow-default-policy-evaluation`](../tech-debt.md#id-shadow-default-policy-evaluation)
- `docs/agent-context/performance-metrics.md` — existing targets and known gaps
- `docs/plans/lighting-shadow-refactor-plan.md`
- `docs/features/postprocessing-effects.md`
- `client/src/core/AppSettings.ts` — settings inventory source of truth, `updateSettings()` for
  atomic batch apply
- `client/src/ui/pause/panels/GraphicsSettingsPanel.ts` — existing `applyQualityPreset()`, current
  `LIGHTING_QUALITY` tier labels
- `client/src/lighting/ShadowPolicy.ts` — shadow map size/algorithm switch by `shadowQuality`
- `client/node_modules/postprocessing/build/index.cjs` — `EffectComposer`'s `multisampling` option
  (source of the MSAA finding above)
- `docs/scratch/` — where the throwaway sweep orchestrator and presets belong

---
**Signature**: P1
