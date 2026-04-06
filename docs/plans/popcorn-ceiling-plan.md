# Design Plan: Improved Popcorn Ceiling Texture

## 1. Current State
The current ceiling texture is generated in `ceiling-popcorn.ts` using three layers of `octaveNoise`:
- **Base Layer**: Low frequency (`bumpDensity=14`) for broad height variation.
- **Detail Layer**: Medium frequency (`detailScale=5`) for medium bumps.
- **Micro Layer**: High frequency (`detailScale*3`) for surface roughness.
- **Material**: `MeshStandardMaterial` with `roughness: 0.95`, tiled 6x6 in `SharedMaterialManager.ts`.
- **Resolution**: 512x512 pixels.

## 2. Diagnosis
The texture reads as "blurry" or "muddy" in VR because:
1. **Low Frequency/Density**: At 6x6 tiling over a typical room ceiling, the 14-density noise translates to very large, soft blobs rather than sharp granules.
2. **Noise Character**: Perlin/Octave noise produces smooth gradients. Real popcorn ceilings consist of discrete, sharp-edged granules (stucco/vermiculite) which create high-contrast micro-shadows.
3. **Normal Map Softness**: The current normal map calculation uses central differencing on smooth noise, resulting in soft shading that disappears under flat lighting.

## 3. Proposed Approach: Cellular Granules
To achieve a convincing "popcorn" look at VR scale (where the user can look directly up at the ceiling), we need sharp, high-density granules.

### Algorithm: Worley/Cellular Noise
Instead of smooth octaves, we will use a cellular approach to create discrete "chunks":
1. **Worley Layer**: Generate a high-density Worley noise (F1 or F2-F1) to define granule centers.
2. **Granule Profile**: Shape each cell into a steep dome or "blob" using a power function (e.g., `1.0 - dist^2`).
3. **Density Mask**: Use a secondary low-frequency Perlin noise to "clump" the granules, leaving some areas slightly flatter than others for natural irregularity.
4. **Layered Stipple**:
   - **Base**: Flat off-white/beige.
   - **Granules**: Slightly brighter than base (protrusions catch more light).
   - **Occlusion**: Add a tiny dark "ring" or shadow offset around the base of granules in the diffuse map to fake micro-shadowing.

### Texture Parameters
- **Resolution**: Increase to 1024x1024 (or keep 512 but increase tiling to 12x12).
- **Granule Count**: ~100–200 per tile side to ensure granules are ~2–3mm in-world.

## 4. Fallback: Drop-Ceiling Tiles
If the procedural popcorn remains too noisy/aliased in VR, we can pivot to an office-style drop ceiling:
- **Grid**: 1ft x 1ft or 2ft x 4ft tiles.
- **Pattern**: A simple grid line (1px dark) with a very fine, low-contrast stipple noise (pitted look).
- **Benefit**: Provides a strong sense of scale and perspective, which helps with VR comfort.

## 5. Implementation Instructions (for gemini-flash)
Modify `ceiling-popcorn.ts` to implement a high-contrast stipple/granule pattern:

1. **New `paintCeilingPopcorn` Logic**:
   - Use a simple jittered grid or Worley noise for granule placement.
   - For each pixel, find the distance to the nearest "seed" point.
   - If distance < `granuleRadius`, calculate height `h = cos(dist * PI/2)`.
   - Apply a steep contrast: `finalH = pow(h, 3.0)`.
   - Add a micro-stipple (random 1px noise) to the background to prevent perfectly smooth patches.

2. **Normal Map Enhancement**:
   - Increase the `strength` parameter significantly.
   - Ensure the normal map captures the sharp edges of the granules.

3. **SharedMaterialManager Update**:
   - Adjust `prewarmCeiling` to use the new parameters.
   - Experiment with `repeat: { x: 12, y: 12 }` to ensure the detail is fine enough.

## 6. Effort Estimate
- **1 Turn**: Implementation of the cellular/stipple algorithm in `ceiling-popcorn.ts`.
- **1 Turn**: Tuning tiling and scale in `SharedMaterialManager.ts` based on visual feedback.
