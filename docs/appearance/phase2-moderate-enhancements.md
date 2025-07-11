# Phase 2: Moderate Enhancements (Medium Effort)

## Research Tasks First

### 2.1 Three.js Procedural Shelf Generation Research
**Status**: ✅ **COMPLETED**

**Key Findings**:
- Procedural generation is faster and more flexible than Blender pipeline
- Triangular `/\` shelf design successfully implemented with configurable angle
- Performance is significantly better (instant generation vs file loading)
- Development workflow is much faster with hot-reload capabilities

**Implementation Results**:
- Created `ProceduralShelfGenerator.ts` with full triangular shelf system
- All unit tests passing (5/5 tests)
- Supports configurable width, height, depth, angle, shelf count
- Generated 4-board structure: 2 angled + 2 side supports + horizontal shelves

**Research Outcome**: 
- **Recommendation**: Hybrid approach - procedural for basic geometry, Blender for complex details
- **Decision**: Proceed with procedural generation for Phase 2 implementation
- **Full Analysis**: See `docs/research/phase2-shelf-generation-research.md`

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

### 2.1 Enhanced Procedural Shelf Implementation
**Status**: ✅ **PHASE 2A COMPLETE**
**Time Spent**: ~4 hours

**Completed Tasks**:
- ✅ Created `ProceduralShelfGenerator.ts` with triangular `/\` shelf design
- ✅ Implemented `TextureManager.ts` for PBR material system
- ✅ Created `StoreLayout.ts` for Blockbuster-style store organization
- ✅ All unit tests passing (12/12 tests across 3 components)
- ✅ Hybrid approach validated: procedural + future Blender integration

**Implementation Results**:
- **Shelf Design**: Triangular profile with 12° angled boards, 4 horizontal shelves
- **Material System**: PBR-ready with wood/carpet/ceiling material support
- **Store Layout**: 6 sections (New Releases, Action, Comedy, Family, Drama, Horror)
- **Performance**: Instant generation, optimized for VR (60fps target)

**Files Created**:
- `client/src/scene/ProceduralShelfGenerator.ts` - Triangular shelf generation
- `client/src/utils/TextureManager.ts` - PBR material management
- `client/src/scene/StoreLayout.ts` - Blockbuster-style store layout
- `client/test/unit/scene/ProceduralShelfGenerator.test.ts` - 5 tests passing
- `client/test/unit/scene/StoreLayout.test.ts` - 7 tests passing

**Next Phase**: Phase 2B - Texture assets and visual polish

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
