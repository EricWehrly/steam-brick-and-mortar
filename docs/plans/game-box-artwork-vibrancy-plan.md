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
Implement Phase 1 only (shader color-space correctness) as a small, isolated patch in `client/src/scene/game-box/instancing/LitArtworkMaterial.ts`, then validate visually before touching asset pipeline or adding artistic compensation controls.
