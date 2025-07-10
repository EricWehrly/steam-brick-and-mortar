# Phase 1: Quick Wins (Low Effort, High Impact)

## Research Tasks First

### 1.1 Three.js Material Capabilities Research
**Status**: ✅ **COMPLETED**

**Key Findings**:
- **PBR Support**: Three.js v0.170.0 fully supports PBR materials
- **Available Materials**: `MeshStandardMaterial` (PBR), `MeshPhysicalMaterial` (advanced PBR), `MeshPhongMaterial` (current)
- **Current Usage**: Project uses `MeshPhongMaterial` (older, simpler lighting model)
- **Recommendation**: Upgrade to `MeshStandardMaterial` for better visuals with minimal code changes

**Implementation Example**:
```javascript
// Current (MeshPhongMaterial)
const material = new THREE.MeshPhongMaterial({ color: 0x4a90e2 })

// Upgrade to PBR (MeshStandardMaterial)
const material = new THREE.MeshStandardMaterial({ 
  color: 0x4a90e2,
  roughness: 0.8,
  metalness: 0.1
})
```

### 1.2 Blockbuster Color Palette Research
**Status**: ✅ **COMPLETED** (from reference JSON)

**Color Values**:
- **Walls**: `#DAA520` (mustard yellow)
- **Floor**: `#2F2F2F` (dark gray carpet)
- **Ceiling**: `#F5F5F5` (white popcorn texture)
- **Shelving**: Light wood (`#D2B48C`) with black accents (`#1C1C1C`)

### 1.3 Three.js Lighting Research
**Status**: ✅ **COMPLETED**

**Current Setup**: Basic lighting in `SceneManager.ts`
**Fluorescent Simulation**: Use `RectAreaLight` for realistic fluorescent fixtures
**Color Temperature**: 5000K-6500K = `#E6F3FF` to `#F0F8FF`

---

## Implementation Tasks

### 1.1 Material System Upgrade
**Time Estimate**: 2-3 hours

**Tasks**:
- [ ] Update `GameBoxRenderer.ts` to use `MeshStandardMaterial` instead of `MeshPhongMaterial`
- [ ] Create material utility functions for consistent PBR properties
- [ ] Update `SceneManager.ts` floor material to PBR
- [ ] Test performance impact in VR

**Files to Edit**:
- `client/src/scene/GameBoxRenderer.ts` - Replace material creation
- `client/src/scene/SceneManager.ts` - Update floor material
- `client/src/utils/MaterialUtils.ts` - New utility file

### 1.2 Blockbuster Color Scheme
**Time Estimate**: 1-2 hours

**Tasks**:
- [ ] Apply mustard yellow wall color to scene background
- [ ] Update floor color to dark gray carpet
- [ ] Create color constant file for consistent palette
- [ ] Add ceiling plane with white color

**Files to Edit**:
- `client/src/utils/Colors.ts` - New color constants file
- `client/src/scene/SceneManager.ts` - Apply background and floor colors
- `client/src/scene/SceneManager.ts` - Add ceiling plane

### 1.3 Fluorescent Lighting Upgrade
**Time Estimate**: 2-3 hours

**Tasks**:
- [ ] Research Three.js `RectAreaLight` for fluorescent simulation
- [ ] Replace current lighting with fluorescent-style setup
- [ ] Set color temperature to cool white (5000K-6500K)
- [ ] Remove dramatic shadows for retail store feel

**Files to Edit**:
- `client/src/scene/SceneManager.ts` - Update lighting setup
- Add RectAreaLight helper imports

### 1.4 Simple Wall Signage
**Time Estimate**: 4-6 hours

**Tasks**:
- [ ] Research Three.js text rendering options (`TextGeometry` vs canvas textures)
- [ ] Create signage utility class
- [ ] Add "NEW RELEASES", "EMPLOYEE PICKS", "FAMILY" signs
- [ ] Position signs above shelf sections

**Files to Edit**:
- `client/src/scene/SignageRenderer.ts` - New signage class
- `client/src/scene/SceneManager.ts` - Integrate signage

---

## Success Criteria

- [ ] **Visual Impact**: Recognizable Blockbuster color scheme
- [ ] **Materials**: PBR materials working properly
- [ ] **Lighting**: Even, bright "retail store" lighting
- [ ] **Signage**: Clear, readable category signs
- [ ] **Desktop Testing**: All improvements work smoothly in desktop 3D mode

---

## Notes

### LOD Consideration
As requested, noting for future phases: Traditional LOD not needed for current scope, but **dummy objects** for distant shelves/props will be useful in Phase 2-3 for performance optimization.

### Next Phase Dependencies
- Phase 2 depends on material system upgrade completion
- Signage system will be extended in Phase 2 for 3D elements
- Lighting system will be enhanced in Phase 3 for interactive controls
