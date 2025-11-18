# View-Dependent Rendering Technique

## Overview
A shader technique that makes content visible only at oblique viewing angles (peripheral vision), hiding it when viewed directly.

## Discovery
While debugging sticker rendering, we accidentally created a view-dependent visibility effect by using view-space normals with a threshold check.

## How It Works

### Shader Code
```glsl
// In fragment shader:
// vNormal is in view space (relative to camera)
if (abs(vNormal.x) > 0.9) {
    // Content only renders when surface normal's X component
    // (in view space) is close to ±1
    // This happens at oblique angles, not direct views
    diffuseColor.rgb = vec3(1.0, 0.0, 0.0);
}
```

### Behavior
- **Direct view**: Surface normal points toward camera (Z-axis in view space), X ≈ 0, content hidden
- **Oblique angle**: Surface normal has strong X component, content becomes visible
- **Hysteresis effect**: Content stays visible when moving tangentially, disappears when backing away

## Potential Use Cases
1. **Hidden messages/easter eggs**: Only visible from specific angles
2. **Stealth mechanics**: Objects that hide when directly observed
3. **Peripheral awareness indicators**: UI elements that appear at screen edges
4. **Artistic effects**: Content that "phases in" at angles
5. **Horror/suspense**: Things that disappear when you look directly at them

## Implementation Notes
- View-space normals are automatically available as `vNormal` in Three.js MeshStandardMaterial
- Adjust threshold (0.9) for different visibility angles
- Can check different axes (X, Y, Z) for different directional behaviors
- Combine with other conditions for more complex effects

## Related Concepts
- View-dependent lighting (Fresnel effects)
- Screen-space effects
- Camera-relative rendering

## Date Discovered
November 13, 2025

## Context
Steam Brick and Mortar project - Shelf sticker system debugging
