# Dissolve Animation Research

## Problem Statement
Implement smooth "dissolve" entrance animations for store geometry (walls, ceiling, light fixtures) to eliminate jarring "pop" appearance when the scene loads. The goal is to create an immersive materialization effect where elements fade in smoothly.

## Investigation Summary
Through extensive debugging, we identified critical issues with THREE.js material sharing and opacity-based animation systems that prevent smooth dissolve effects.

## Key Findings

### 1. Shared Material Problem
**Issue**: Multiple THREE.js meshes sharing the same material instance causes opacity changes to affect all meshes simultaneously.

**Evidence**: 
```typescript
// All walls shared one material instance
const wallMaterial = await this.textureManager.createWoodMaterial(config)
const backWall = new THREE.Mesh(geometry, wallMaterial)
const leftWall = new THREE.Mesh(geometry, wallMaterial) // Same reference!
```

**Impact**: When DissolveAnimator sets `material.opacity = 0`, all walls become invisible at once, causing scene blackout instead of individual control.

### 2. Animation Loop Validation
**Success**: Basic opacity cycling works correctly when applied to existing visible materials.
- Sine wave opacity cycling: `opacity = (Math.sin(progress * Math.PI * 2) + 1) / 2`
- 60fps requestAnimationFrame loop functions properly
- Material transparency flags work as expected

**Insight**: The animation system itself is sound; the issue is with initial state preparation.

### 3. Material State Management
**Challenge**: Coordinating initial invisible state (`opacity: 0`) with subsequent fade-in animation across multiple objects with different material types.

**Complexity**: 
- MeshStandardMaterial vs MeshBasicMaterial handling
- Transparency flag management (`material.transparent = true`)
- Scene rendering pipeline timing

### 4. Multi-Object Coordination
**Issue**: Dissolve sequences involving multiple objects (walls, ceiling, fixtures) require careful orchestration to avoid visual artifacts.

**Current Approach**: Staggered timing with delay offsets, but material sharing breaks individual control.

## Technical Requirements for Future Implementation

### 1. Material Instance Isolation
Each animatable object must have its own material instance:
```typescript
// Instead of shared materials
const materials = await Promise.all([
  textureManager.createWoodMaterial(config),
  textureManager.createWoodMaterial(config), 
  textureManager.createWoodMaterial(config)
])
```

### 2. Animation State Tracking
Need robust system to track animation states and prevent conflicts:
- Per-object animation state
- Animation cancellation/override handling
- Graceful fallbacks when animations fail

### 3. Render Pipeline Integration
Consider THREE.js rendering order and transparency sorting:
- Objects with `transparent: true` materials render after opaque objects
- Alpha blending order can cause visual artifacts
- May need custom shaders for complex dissolve effects

### 4. Performance Considerations
Multiple material instances increase memory usage:
- Consider material pooling for repeated animations
- GPU shader-based dissolve might be more efficient than CPU opacity changes
- Benchmark with realistic object counts

## Alternative Approaches to Investigate

### 1. Shader-Based Dissolve
Use custom vertex/fragment shaders with uniform controls:
```glsl
uniform float dissolveAmount;
// Shader code for smooth dissolve patterns
```

### 2. Object3D Visibility + Scale
Combine visibility toggling with scale animations for "materialize" effect.

### 3. Texture-Based Alpha Masks
Use animated alpha textures to create complex dissolve patterns.

### 4. Post-Processing Effects
Screen-space dissolve effects applied to rendered geometry.

## Recommended Implementation Timeline

**Phase 1**: Material isolation and basic fade-in (1-2 days)
- Fix shared material instances in RoomStructureBuilder
- Implement single-object dissolve animation
- Validate with simple test cases

**Phase 2**: Multi-object coordination (2-3 days)  
- Staggered sequence orchestration
- Animation state management
- Error handling and fallbacks

**Phase 3**: Performance optimization (1-2 days)
- Benchmark material instance overhead
- Consider shader-based alternatives
- Memory usage optimization

## Current Code Status
All dissolve animation code is implemented but disabled due to shared material issues. Key files:
- `src/utils/DissolveAnimator.ts` - Core animation system
- `src/scene/RoomStructureBuilder.ts` - Room creation with dissolve support
- `src/scene/EnvironmentRenderer.ts` - Test methods and coordination

## Testing Infrastructure
Diagnostic methods are in place for future debugging:
- `startWallOpacityTest()` - Opacity cycling validation
- `testBackWallDissolve()` - Single-object dissolve test
- Material sharing detection logs

## Priority Assessment
**Medium Priority**: Enhances user experience but not critical for core functionality. The immediate "pop" appearance is acceptable for MVP, and smooth dissolve effects can be added as a polish feature.

The investigation time was valuable for understanding THREE.js material systems and will inform future animation work beyond just dissolve effects.