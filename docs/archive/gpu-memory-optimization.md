# GPU Memory Optimization Analysis

## Current State (Estimated)

Based on code analysis, here's our current VRAM allocation:

| Component | Size | Layers | VRAM |
|-----------|------|--------|------|
| Artwork Texture Array | 512×512×4 | 1024 | **1,024 MB** |
| Label Texture Array | 512×512×4 | 910 | **~953 MB** |
| InstancedMesh Buffers | matrices | ~1000 | ~50 MB |
| Procedural Textures | varies | ~10 | ~40 MB |
| **Total** | | | **~2 GB** |

## Problem: Pre-allocation

We're pre-allocating full texture arrays for maximum capacity:
- `maxTextures: 1024` in InstancedArtworkRenderer
- `maxTextures: 910` in LabelTextureArrayManager

Even if a user has 50 games, we allocate for 1024.

## Optimization Strategies (Priority Order)

### 1. **Dynamic Texture Array Sizing** (HIGH IMPACT, LOW EFFORT)
- Allocate based on actual game count, not max capacity
- Add 10-20% headroom for safety
- Example: 100 games → allocate 120 layers, not 1024

**Savings**: ~1.8 GB for small libraries

### 2. **Texture Atlas Instead of Array** (HIGH IMPACT, MEDIUM EFFORT)
- Pack multiple game images into single 4096×4096 or 8192×8192 texture
- 460×215 Steam headers → ~80 per 4096×4096 atlas
- UV mapping per instance instead of texture array layer index

**Pros**:
- Much smaller total allocation
- Better GPU cache utilization
- Supports arbitrary image counts

**Cons**:
- More complex UV calculations
- Need atlas packing algorithm
- Dynamic repacking on updates

**Savings**: ~90% reduction for typical libraries

### 3. **Reduce Texture Resolution** (MEDIUM IMPACT, LOW EFFORT)
- Steam headers are 460×215
- We're storing in 512×512 slots (wasted space!)
- Could use 256×128 or even 128×64 for distant shelves

**Savings**: 75% reduction at 256×256, 94% at 128×128

### 4. **LOD-based Texture Loading** (MEDIUM IMPACT, HIGH EFFORT)
- Load low-res thumbnails initially
- Upgrade to full res when player approaches
- Unload high-res when player moves away

### 5. **Lazy Texture Array Growth** (LOW IMPACT, LOW EFFORT)
- Start with small array (64 layers)
- Grow as needed (double on resize)
- Three.js may require recreating texture (verify)

### 6. **Compressed Texture Formats** (MEDIUM IMPACT, MEDIUM EFFORT)
- Use GPU-compressed formats (DXT/BC, ETC2, ASTC)
- Requires pre-processing images server-side
- Not all formats supported on all devices

## Recommended Approach

**Phase 1 (Quick Win)**: Dynamic sizing based on actual game count
- Modify constructors to take actual count, not max
- Add small buffer (10-20%)
- Estimated savings: 80-90% for most users

**Phase 2 (If needed)**: Texture atlas
- Only if Phase 1 isn't sufficient
- More complex but optimal for large libraries

## Implementation Notes

### Debug Tool Added
`GpuMemoryEstimator.logReport(renderer)` - call from console to see breakdown

### Key Files to Modify
- `InstancedArtworkRenderer.ts` - artwork texture array
- `LabelTextureArrayManager.ts` - label texture array
- `GpuStorePropsRenderer.ts` - passes maxInstances config

### Testing Approach
1. Add memory logging at startup
2. Compare before/after optimization
3. Test with various library sizes (10, 100, 500, 1000 games)
