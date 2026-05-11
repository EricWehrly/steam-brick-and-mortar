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
