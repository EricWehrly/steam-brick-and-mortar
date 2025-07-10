# Phase 2: Moderate Enhancements (Medium Effort)

## Research Tasks First

### 2.1 Three.js Procedural Shelf Generation Research
**Status**: ❌ **REQUIRED**

**Key Questions**:
- Should we replace Blender pipeline with pure Three.js procedural generation?
- What are the trade-offs between Blender GLTF vs Three.js BoxGeometry?
- Can we maintain same visual quality with procedural generation?
- How do materials/textures work between the two approaches?

**Research Plan**:
1. **Compare Approaches**:
   - Current: Blender Python → GLTF → Three.js GLTFLoader
   - Alternative: Pure Three.js BoxGeometry + procedural assembly
2. **Prototype Simple Shelf**: Create basic shelf in Three.js and compare to Blender output
3. **Material Compatibility**: Test PBR materials on both approaches
4. **Performance Comparison**: Measure load times and memory usage

**Expected Research Time**: 4-6 hours

### 2.2 Texture Asset Pipeline Research
**Status**: ❌ **REQUIRED**

**Key Questions**:
- What texture formats work best for WebXR performance?
- How to create/source carpet, wood grain, popcorn ceiling textures?
- Should we use procedural textures or image-based textures?
- What resolutions are optimal for VR without performance impact?

**Research Plan**:
1. **Texture Format Investigation**: WebP, AVIF, PNG, JPG performance in Three.js
2. **Procedural vs Image Textures**: Compare Three.js procedural textures vs loaded images
3. **VR Performance Testing**: Test different texture resolutions in VR
4. **Texture Sources**: Identify free/paid texture resources for retail environment

**Expected Research Time**: 3-4 hours

### 2.3 Store Layout Spatial Design Research
**Status**: ❌ **REQUIRED**

**Key Questions**:
- How to translate Blockbuster reference layout to 3D coordinates?
- What are optimal VR navigation distances and spacing?
- How to organize Steam game categories spatially?
- What room dimensions work best for VR movement?

**Research Plan**:
1. **VR Ergonomics**: Research comfortable VR navigation distances
2. **Spatial Mapping**: Convert Blockbuster layout to Three.js coordinates
3. **Category Organization**: Map Steam game categories to physical store sections
4. **Room Dimensions**: Determine optimal play space size

**Expected Research Time**: 2-3 hours

---

## Implementation Tasks (After Research)

### 2.1 Shelf Generation Decision & Implementation
**Time Estimate**: 6-8 hours (depends on research outcome)

**Option A: Keep Blender Pipeline**
- [ ] Enhance Blender materials for better Three.js compatibility
- [ ] Optimize GLTF export for WebXR performance
- [ ] Add procedural variation to Blender scripts

**Option B: Pure Three.js Procedural**
- [ ] Create `ProceduralShelfGenerator.ts` class
- [ ] Implement modular shelf assembly system
- [ ] Maintain visual parity with Blender version

**Files to Edit**:
- `client/src/scene/ShelfGenerator.ts` - New procedural shelf class (if Option B)
- `client/src/scene/AssetLoader.ts` - Update loading logic
- `blender/` scripts - Enhance materials (if Option A)

### 2.2 Enhanced Texture Implementation
**Time Estimate**: 8-10 hours

**Tasks**:
- [ ] Create texture library structure
- [ ] Implement carpet texture with normal maps
- [ ] Add wood grain textures for shelving
- [ ] Create popcorn ceiling texture
- [ ] Optimize texture loading for VR performance

**Files to Edit**:
- `client/src/utils/TextureManager.ts` - New texture management class
- `client/src/scene/SceneManager.ts` - Apply textures to scene elements
- `client/public/textures/` - New texture asset directory

### 2.3 Store Layout Organization
**Time Estimate**: 6-8 hours

**Tasks**:
- [ ] Define room dimensions and navigation paths
- [ ] Position entrance/exit areas
- [ ] Create category zones (New Releases, Family, etc.)
- [ ] Add spatial navigation aids

**Files to Edit**:
- `client/src/scene/StoreLayout.ts` - New layout management class
- `client/src/scene/SceneManager.ts` - Integrate layout system
- `client/src/webxr/NavigationManager.ts` - VR navigation helpers

### 2.4 Atmospheric Props
**Time Estimate**: 6-8 hours

**Tasks**:
- [ ] Create wire rack displays for snack areas
- [ ] Add category dividers and shelf separators
- [ ] Implement basic ceiling fixtures
- [ ] Add floor wear patterns or navigation markers

**Files to Edit**:
- `client/src/scene/PropRenderer.ts` - New props management class
- `client/src/scene/SceneManager.ts` - Integrate props system

---

## Success Criteria

- [ ] **Layout**: Recognizable Blockbuster store flow and organization
- [ ] **Textures**: Realistic carpet, wood, ceiling materials
- [ ] **Performance**: Smooth VR performance with enhanced textures
- [ ] **Navigation**: Comfortable VR movement through store layout
- [ ] **Props**: Atmospheric details that enhance immersion

---

## Notes

### Critical Decision Point: Blender vs Three.js
This phase depends heavily on the shelf generation research outcome. The decision will impact:
- **Development workflow**: Blender iteration vs JavaScript iteration
- **Asset pipeline**: GLTF loading vs procedural generation
- **Material consistency**: Ensuring same material system throughout
- **Performance**: Different optimization approaches

### Texture Performance Considerations
VR texture requirements are more demanding than desktop:
- **Resolution**: Balance visual quality vs performance
- **Compression**: Use appropriate formats for WebXR
- **Memory**: Manage texture memory for longer VR sessions
- **Streaming**: Consider progressive texture loading

### LOD Planning
Begin implementing "dummy" objects for distant props:
- **Simple geometry**: Basic shapes for background elements
- **Texture switching**: Lower resolution textures for distant objects
- **Visibility culling**: Remove objects outside VR view frustum
