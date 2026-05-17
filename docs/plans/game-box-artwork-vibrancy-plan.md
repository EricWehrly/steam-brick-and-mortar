# Game Box Artwork Vibrancy Plan

## 1. Problem Statement
Game box artwork in the lit instanced path appears desaturated, even after:
- lowering roughness
- increasing scene brightness
- preventing HIGH/MID texture mixing

Current shader integration lives in `client/src/scene/game-box/instancing/LitArtworkMaterial.ts`, and the key map replacement logic is in the fragment chunk near `client/src/scene/game-box/instancing/LitArtworkMaterial.ts`.

## 2. Most Likely Root Cause
Highest-confidence issue: missing color-space conversion in the custom map chunk.

Why this is likely:
- Standard MeshStandardMaterial map path converts sampled texture color before applying to diffuse.
- Our custom chunk samples from sampler2DArray and multiplies directly into diffuseColor.
- Comment currently says mapTexelToLinear handles color-space, but that function is not called in this custom path.

Expected visual symptom of this mismatch:
- reduced perceived contrast and saturation
- washed out look that is not solved by roughness/intensity tweaks

## 3. Design Goals
- Preserve physically plausible lighting and shadows.
- Match visual vibrancy of source artwork as closely as possible.
- Keep instanced performance profile.
- Make tuning explicit and reversible.

## 4. Proposed Approaches

### Approach A: Correct Color Management in Shader (Recommended First)
Change the custom chunk so sampled array texels go through the same color-management conversion expected by the standard material pipeline before multiplying into diffuseColor.

Scope:
- `client/src/scene/game-box/instancing/LitArtworkMaterial.ts`

Pros:
- Minimal invasive change.
- Aligns with Three material semantics.
- Likely fixes the core issue.

Risks:
- Requires verifying which conversion helper is valid in this shader context for Three 0.183.2.

### Approach B: Ensure Texture Array Inputs Are Tagged/Prepared Correctly
Audit where MID/HIGH DataArrayTextures are created/populated and confirm color interpretation is consistent with expected shader conversion path.

Likely touch points:
- `client/src/scene/game-box/instancing/GameArtworkProvider.ts`
- `client/src/scene/game-box/instancing/HighTextureCache.ts`

Pros:
- Prevents hidden mismatch between source data and shader expectations.
- Future-proofs when adding additional texture channels.

Risks:
- Slightly broader effort.
- May uncover differences between eager and lazy paths.

### Approach C: Controlled Artistic Compensation Layer
Add optional saturation/gamma/vibrance controls in shader, defaulted to neutral.

Pros:
- Fast visual tuning.
- Useful for art direction.

Risks:
- Can hide real pipeline bugs if used first.
- Less physically grounded.

## 5. Recommended Execution Plan

### Phase 1: Color-Space Correctness Pass
- Implement conversion in the custom map chunk.
- Add a temporary debug mode to visualize raw sampledColor versus final diffuse contribution.
- Verify no regression in shadows/lighting behavior.

### Phase 2: Texture Source Audit
- Validate MID and HIGH array population paths produce equivalent color behavior.
- Confirm no accidental pre-transform in one path and not the other.
- Confirm filtering/mipmap settings are consistent between arrays.

### Phase 3: Optional Artistic Controls
- Only after correctness is confirmed, add optional vibrance tuning controls if desired.
- Gate with defaults that preserve current baseline.

## 6. Validation Plan

Visual checks:
- Side-by-side before/after screenshot set under identical camera and light settings.
- Compare known color-rich covers (reds, blues, skin tones, neon artwork).

Functional checks:
- LOD transition does not shift hue/saturation unexpectedly.
- Slider changes in lighting panel still behave predictably.
- No performance hitch from shader change.

Regression checks:
- No break in current lit/shadow response.
- No compile warnings in patched shader pipeline.

## 7. Acceptance Criteria
- Artwork appears materially closer to source vibrancy in lit mode.
- No obvious desaturation versus unlit reference beyond expected physically based shading.
- HIGH and MID LOD paths are color-consistent at transition boundaries.
- No measurable regression in startup stability or frame pacing.

## 8. Immediate Next Step
The original "Phase 1 only" next step has already been overtaken by implementation work.

Current practical next step:
- consolidate this into a small hardening pass on the existing material path (replacement checks/assertions and visual regression capture), rather than changing renderer architecture.

What is already in place:
- lit artwork material path integrated
- lighting profile retune completed
- texture-array color pipeline fixes applied
- optional albedo boost hook validated during tuning

## 9. Reassessment After TSL Spike

### What We Were Here To Fix
The original issue was not "make the renderer more modern." It was:
- game box artwork looked muted in the lit instanced path
- the custom array-texture material path was deviating from Three.js's standard map handling
- we wanted more vibrancy without breaking shadows, tone mapping, or instancing performance

### Why TSL Was Considered And Then Rejected For Now
TSL looked attractive because it would replace shader string patching with a structured node graph. In practice, it pushes this renderer toward `WebGPURenderer`, which means a broader renderer migration.

That is a larger project than this fix and it changes too many surrounding assumptions at once for current work:
- renderer construction and type signatures
- WebXR integration
- debug renderer instrumentation
- capability detection and test coverage

Conclusion: TSL is a valid future direction, but it is not the right next step for this branch or for the foreseeable roadmap.

### Remaining Options
1. Keep the current `MeshStandardMaterial` + `onBeforeCompile` path, but harden it with replacement checks and small focused assertions.
2. Move to a fully custom `ShaderMaterial` if we want explicit control without string replacement, while staying on `WebGLRenderer`.
3. Revisit TSL/WebGPU only as part of a deliberate renderer migration project, not as a material-only cleanup.

### Current Decision
For now, do not pursue the TSL path. Treat the existing material approach as the baseline, and only revisit if we intentionally start a renderer-wide migration later.

## 10. Where We Are Overall On This Path

We started this path to improve realism and shelf presence by making game boxes:
- respond to light/shadow more like the rest of the scene
- retain stronger color/vibrancy under the lit path
- avoid regressions in LOD and instancing performance

Current state:
- The visual quality direction is working: boxes read more convincingly in lit scenes than before.
- The remaining work is mostly hardening and polish, not foundational architecture change.

Remaining options from here:
1. Maintain and harden current `MeshStandardMaterial` + `onBeforeCompile` path (recommended short-term).
2. Move to full custom lit shader path if patching complexity grows.
3. Re-open TSL only inside a deliberate renderer migration project.
