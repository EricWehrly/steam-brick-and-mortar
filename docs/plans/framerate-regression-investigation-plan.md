# Plan: Framerate Regression Investigation

**Status**: Not started — investigation only, no root cause confirmed yet
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
Don't re-attribute that one to post-processing/shadows without new evidence.

## Investigation methodology

1. **Establish a real baseline, not a guess.** Check out the commit immediately before
   `07f35655` (pipeline establishment) and `24fa8070`/`6827399d` (shadow work) and capture frame
   time via the tooling in the research doc, same scene/library, same machine, same session
   length. This is the "before" the current unstable framerate needs to be compared against — it
   likely doesn't exist yet.
2. **A/B toggle each suspected contributor independently**, not both at once:
   - Post-processing: temporarily bypass `RenderPipelineManager`'s composer (render directly via
     `renderer.render()`, same as the existing XR bypass path) and compare.
   - Shadows: toggle `castShadow`/`receiveShadow` off on the two commits' touched files
     (`SignageRenderer.ts`, `BlockLetterSignRenderer.ts`, `NeonTubeSignRenderer.ts`,
     `LightingRenderer.ts`) and compare.
   - Run each toggle against the same sampling-window methodology so results are comparable, not
     eyeballed.
3. **If both contribute, quantify each independently** before deciding what (if anything) to cut —
   "unstable framerate" could be one dominant cause or several small compounding ones; the fix
   differs a lot depending on which.
4. **Write findings back into this doc** (a dated "Findings" section) before starting any fix —
   don't jump straight to optimization once a suspect is confirmed; confirm the size of the win
   first.

## Explicitly out of scope for this doc

- Actually implementing a fix — this doc stops at diagnosis and a recommended next step
- The already-diagnosed detail-panel draw-call issue (see "Known, separately-tracked" above)
- Deciding shadow policy centralization — that's `shadow-default-policy-evaluation`'s job; this
  doc only decides whether shadows are *a* contributor worth centralizing sooner

## Related

- [Frame-Time Diagnostic Tooling Research](../research/frame-time-diagnostic-tooling-research.md) — what to measure with
- [`shadow-default-policy-evaluation`](../tech-debt.md#id-shadow-default-policy-evaluation)
- `docs/agent-context/performance-metrics.md` — existing targets and known gaps
- `docs/plans/lighting-shadow-refactor-plan.md`
- `docs/features/postprocessing-effects.md`
