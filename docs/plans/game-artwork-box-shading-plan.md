# Game Artwork Box Shading Plan

## Goal
Enable believable lighting and shadow response for instanced game artwork boxes so they visually integrate with shelves/room lighting, while preserving current instancing performance constraints.

## Current State
- Artwork boxes and label boxes use custom `ShaderMaterial` pipelines in instanced renderers.
- Mesh shadow flags are enabled, so silhouettes can cast onto receivers.
- Fragment/vertex shaders currently sample texture arrays directly with no Three.js lighting/shadow chunk integration.
- Result: boxes do not visibly receive scene lighting/shadow in the same way as `MeshStandardMaterial` assets.

## Constraints
- Preserve instanced rendering throughput and memory envelope.
- Avoid regressions in texture-array LOD behavior.
- Keep fallback behavior for low lighting/shadow quality settings.

## Early Feasibility Notes (2026-05-10)
- Current `LodGameArtworkRenderer` uses a bare `ShaderMaterial` with no Three.js lighting/shadow chunks, which explains the flat/unlit receive behavior.
- The project already uses `onBeforeCompile` to extend `MeshStandardMaterial` in other systems, so a material-strategy path is consistent with existing patterns.
- The instanced pipeline is already WebGL2-oriented; `sampler2DArray` support is a reasonable baseline assumption for this renderer path.
- Practical recommendation for the spike: prioritize Option B first, but implement it as `MeshStandardMaterial + onBeforeCompile` patching instead of a full custom lit shader rewrite.

## Proposed Phases

### Phase 1: Spike and Approach Selection
1. Prototype one lighting-aware path for `LodGameArtworkRenderer` only:
   - Option A: extend custom shader with Three.js light/shadow chunks (`lights` + shadow uniforms/varyings).
   - Option B: migrate to a material strategy that supports texture-array sampling with built-in lighting (if feasible).
     - Candidate implementation: create a `MeshStandardMaterial` and patch shader chunks via `onBeforeCompile`.
     - Inject attributes/varyings (`textureIndex`, `lodLevel`, `highTextureSlot`) and sample `sampler2DArray` uniforms in the map stage.
     - Keep all built-in lighting, shadow, tone mapping, fog, and normal handling from the standard material pipeline.
2. Measure frame-time impact in anonymous store and medium-size library scene.
3. Decide on one approach and document tradeoffs.

### Phase 1.5: Option B Spike Checklist (first pass)
1. Add a small material factory in the instancing module for a lit artwork material.
2. Start with color-map-only patching (no normal/roughness texture arrays yet) to minimize risk.
3. Verify compile/runtime behavior on startup and on `shadowMapEnabled` / `shadowQuality` toggles.
4. Compare before/after on:
   - visible light/shadow response on artwork faces
   - startup time and frame-time deltas
   - shader compile warnings/errors
5. If shader patching proves brittle, fall back to Option A in the same spike branch.

### Phase 2: Implementation
1. Implement chosen path for artwork boxes (`LodGameArtworkRenderer`).
2. Keep label renderer behavior intentionally separate:
   - either remain unlit by design, or
   - apply a minimal lit variant with explicit readability guardrails.
3. Verify that cast/receive behavior is coherent with room and shelf shadows.

### Phase 3: Quality and Regression Coverage
1. Add tests/assertions for renderer assumptions:
   - shader/material path indicates expected lighting mode.
   - shadow participation flags are preserved.
2. Add playtest checklist entries for visual verification under:
   - `shadowMapEnabled` on/off
   - `shadowQuality` low/medium/high
3. Capture before/after screenshots for review.

## Acceptance Criteria
- Artwork boxes visibly respond to scene lighting/shadow in normal gameplay.
- No obvious startup or runtime hitch introduced by shader/material changes.
- No regressions in LOD texture-array behavior.
- Behavior remains predictable when shadow settings are toggled at runtime.

## Open Questions
- Should label boxes remain visually flatter for readability, even if artwork boxes become lit?
- Should we gate box shadow-receive quality by `shadowQuality` tier to reduce cost?
- Do we want per-material tuning (roughness/metalness equivalents) for artwork cards?
- Do we need an explicit WebGL2 capability guard around the lit-array material path, or is current renderer registration already sufficient?

## Out of Scope
- Full signage visual redesign.
- Non-instanced fallback rendering architecture.

## Implementation Outcome Snapshot (2026-05)

The Phase 1/2 direction has effectively been exercised and integrated.

What was achieved:
- `LodGameArtworkRenderer` now uses a lit artwork material path built on `MeshStandardMaterial` with `onBeforeCompile` array-texture sampling.
- Artwork boxes now receive scene lighting/shadow response in a way that is materially closer to other PBR scene assets.
- Related visual support work landed alongside this path:
   - lighting profile retune for retail readability
   - texture-array color pipeline corrections
   - better runtime lighting controls for balancing

What this plan proved:
- Option B (material strategy with standard lighting pipeline) is viable and currently the baseline path.
- Full TSL/NodeMaterial migration is not a material-only drop-in for this app's current renderer stack and is deferred.

Recommended next options from here:
1. Harden current material patching with compile-time replacement checks/assertions.
2. If maintainability becomes a pain point, evaluate a full custom lit `ShaderMaterial` while staying on `WebGLRenderer`.
3. Treat TSL/WebGPU as a separate renderer-migration initiative, not an incremental shading tweak.

## Pre-Clutter Technical Options (Actionable)

These are scene-immersion improvements that do not require designing new clutter props first.

### Tier 1: Fast visual wins (0.5-2 days)
1. Add controlled card gloss shaping on artwork boxes.
   - Why: game boxes should read as coated print stock, not matte cardboard.
   - How: expose and tune roughness/metalness envelope for artwork material, and optionally add a mild view-dependent highlight approximation.
   - Touch points: `client/src/scene/game-box/instancing/LitArtworkMaterial.ts`.
   - Validation: compare shelf-angle specular response in 3 camera positions under existing retail lighting.

2. Add subtle fresnel edge lift for box readability.
   - Why: edge reflections help silhouettes read at oblique angles.
   - How: multiply a small grazing-angle boost into final albedo or specular response, clamped to avoid artificial halos.
   - Touch points: `client/src/scene/game-box/instancing/LitArtworkMaterial.ts`.
   - Validation: ensure front-facing color is unchanged while side-angle readability improves.

3. Improve shadow contact grounding around shelf intersections.
   - Why: boxes feel floaty when contact shadows are too soft or weak.
   - How: tighten directional shadow camera fit and bias tuning for shelf zones already in the scene.
   - Touch points: `client/src/lighting/ShadowPolicy.ts`, `client/src/scene/LightingRenderer.ts`.
   - Validation: side-by-side snapshots at shelf base and under overhangs.

### Tier 2: Medium effort, strong realism gain (1-3 days)
1. Add lightweight per-instance variation to break clone look.
   - Why: identical roughness and response across all boxes reads synthetic even before clutter.
   - How: derive a deterministic per-instance variation factor from `textureIndex` and apply small roughness or albedo offsets within strict bounds.
   - Touch points: `client/src/scene/game-box/instancing/LitArtworkMaterial.ts`, `client/src/scene/game-box/instancing/LodGameArtworkRenderer.ts`.
   - Validation: no visible popping across LOD transitions; variation should remain subtle.

2. Add edge-wear micro normal for box side faces only.
   - Why: perfectly flat side faces reduce realism at close range.
   - How: apply a tiny procedural normal perturbation on non-front faces, leaving cover art face clean.
   - Touch points: `client/src/scene/game-box/instancing/LitArtworkMaterial.ts`.
   - Validation: close-up pass in VR and desktop to ensure no shimmering.

3. Add scene reflection context for glossy response.
   - Why: gloss looks wrong when there is nothing meaningful to reflect.
   - How: ensure environment contribution is present and tuned for retail interior values.
   - Touch points: scene setup and material environment configuration paths.
   - Validation: highlight movement should track camera and light shifts naturally.

### Derived Artwork Map Investigation

This is a plausible next-step quality path if the current flat roughness envelope tops out visually.

What to derive:
- A low-frequency roughness mask from the artwork image, biased so dark ink-heavy regions stay slightly rougher and bright coated highlight regions can read a little smoother.
- Optionally, a very conservative albedo modulation mask for broad wear/dust shaping only. Do not treat the box art itself as a height field; that usually produces fake embossed covers.

Recommended implementation shape:
- Keep derivation off the main thread by extending the existing artwork texture worker/pixel pipeline rather than generating maps in the render loop.
- Derive maps from the same decoded source pixels already fetched for MID/HIGH artwork slices.
- Quantize the derived output aggressively. A single-channel roughness mask is the best first candidate; avoid full RGB companion textures unless the visual win is proven.
- Upload in clusters using the same frame-budget-aware scheduling approach already used for artwork texture array writes so worker completions do not stampede a single frame.

Expected cost profile:
- CPU/build cost: moderate startup or background processing cost, but mostly amortizable because pixel decode and image analysis can run in a worker.
- Main-thread cost: still present when copying derived pixels into texture-array backing stores and triggering GPU upload. Worker offload does not eliminate upload cost.
- VRAM cost: the main risk. A full extra MID and HIGH companion array for roughness would materially increase artwork memory usage.
- Shader cost: relatively small if sampling one extra channel per fragment; much lower risk than the memory/upload side.

Practical recommendation:
- Start with derived roughness only, MID tier only, and cache the results.
- Treat HIGH derived maps as optional follow-up once MID shows a clear visual benefit.
- Avoid derived albedo in the first pass unless the goal is specifically a subtle print-fade or dust treatment; roughness is the safer realism lever.

Suggested pipeline:
1. Extend the artwork worker to emit an optional single-channel roughness buffer alongside the existing color pixels.
2. Store the derived data in the same cache layer keyed by artwork URL plus derivation version.
3. Add a compact roughness companion texture array for MID artwork first.
4. Patch `LitArtworkMaterial` to sample the companion array and modulate `roughnessFactor` within narrow bounds.
5. Gate uploads through the frame-budget scheduler and flush in small batches/clusters.
6. Compare three cases: current scalar roughness, hash-based per-instance variation, and image-derived roughness.

Go / no-go criteria:
- Go if the visual gain is obvious in shelf-angle closeups and the extra upload path does not create noticeable frame dips during library population.
- No-go if the improvement is only visible in stills, if VRAM growth is too high, or if HIGH texture churn becomes meaningfully worse.

### Tier 3: Atmosphere before clutter (1-3 days)
1. Dust motes in lit cones.
   - Why: adds depth cues and "air" without adding geometry clutter.
   - How: low-density particle pass bounded to key light volumes.
   - Existing roadmap tie-in: already tracked by Lighting and Atmosphere feature.

2. Subtle spotlight shimmer or breathing.
   - Why: static lighting can feel lifeless even when technically correct.
   - How: low-amplitude temporal modulation with strict caps.
   - Existing roadmap tie-in: already tracked by Lighting and Atmosphere feature.

## Suggested Execution Order (Before Clutter)
1. Card gloss shaping.
2. Shadow contact grounding.
3. Per-instance variation.
4. Dust motes.

This sequence gives high immersion gain per day while preserving the current architecture and avoiding renderer migration scope.
