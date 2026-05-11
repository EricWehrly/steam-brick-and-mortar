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

## Proposed Phases

### Phase 1: Spike and Approach Selection
1. Prototype one lighting-aware path for `LodGameArtworkRenderer` only:
   - Option A: extend custom shader with Three.js light/shadow chunks (`lights` + shadow uniforms/varyings).
   - Option B: migrate to a material strategy that supports texture-array sampling with built-in lighting (if feasible).
2. Measure frame-time impact in anonymous store and medium-size library scene.
3. Decide on one approach and document tradeoffs.

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

## Out of Scope
- Full signage visual redesign.
- Non-instanced fallback rendering architecture.
