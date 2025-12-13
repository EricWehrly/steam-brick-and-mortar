# Scene Traverse Audit

## Executive Summary

Found **15 `scene.traverse()` or `group.traverse()` calls** across the codebase. Most are appropriately scoped (traversing specific groups, not the full scene), but several traverse the **entire scene** on potentially hot paths.

**Critical Issues**:
- `LightingControlsPanel.scanLights()` - Full scene traverse, called on multiple events
- `DebugStatsProvider.countSceneObjects()` - Full scene traverse, called when debug panel opens
- `GameFinder.findAll()` / `find()` - Full scene traverse for game discovery
- `GpuMemoryEstimator` - Full scene traverse for memory estimation

**Already Optimized**:
- `DiagnosticSpotlight.getRectAreaLights()` - Has caching! ✅ Good pattern to follow

---

## Detailed Audit

### 🔴 HIGH PRIORITY (Full Scene Traversal on Hot Paths)

#### 1. `LightingControlsPanel.scanLights()` 
**File**: `client/src/ui/LightingControlsPanel.ts:209`
**Scope**: Full scene (`this.scene.traverse()`)
**Call Frequency**: 
- On `LightingEventTypes.Created` (every light added)
- On `LightingEventTypes.SystemReady`
- On `performInitialScan()` (constructor)
- On `handleLightRemoved()` (every light removed)

```typescript
this.scene.traverse((object) => {
    if (object instanceof THREE.Light) {
        // Group by light type
    }
})
```

**Impact**: Called multiple times during startup as lights are added. With hundreds of game boxes, this traverses thousands of objects.

**Recommendation**: 
- Cache light references, only update on add/remove events
- Don't re-traverse entire scene - maintain a `Set<THREE.Light>` that gets updated incrementally
- Follow `DiagnosticSpotlight` pattern with cache invalidation

---

#### 2. `LightingControlsPanel.toggleAllDebugHelpers()`
**File**: `client/src/ui/LightingControlsPanel.ts:571`
**Scope**: Full scene (`this.scene.traverse()`)
**Call Frequency**: On debug toggle checkbox change

```typescript
this.scene.traverse((object) => {
    if (object.name && object.name.startsWith('debug-')) {
        object.visible = enabled
    }
})
```

**Impact**: Medium - only triggered by user interaction, not on hot path
**Recommendation**: Maintain a cached list of debug helpers, update incrementally

---

#### 3. `LightingControlsPanel.toggleDebugHelperForLight()`
**File**: `client/src/ui/LightingControlsPanel.ts:557`
**Scope**: Full scene (`this.scene.traverse()`)
**Call Frequency**: On individual light debug toggle

```typescript
this.scene.traverse((object) => {
    if (object.name === debugHelperName) {
        debugHelper = object
    }
})
```

**Impact**: Medium - user triggered, but traverses entire scene to find ONE object
**Recommendation**: Use `scene.getObjectByName()` instead (Three.js built-in, same traversal but stops early when found)

---

#### 4. `DebugStatsProvider.countSceneObjects()`
**File**: `client/src/core/DebugStatsProvider.ts:135`
**Scope**: Full scene (`scene.traverse()`)
**Call Frequency**: Called by `getDebugStats()` when debug panel is shown/refreshed

```typescript
scene.traverse((object) => {
    if (object instanceof THREE.Mesh) meshCount++
    if (object instanceof THREE.Light) lightCount++
    if (object instanceof THREE.Camera) cameraCount++
})
```

**Impact**: Medium-High - Called every time debug stats refresh (potentially every few seconds if panel is open)
**Recommendation**: Cache counts, invalidate on scene structure change events

---

#### 5. `GpuMemoryEstimator.estimateGpuMemory()`
**File**: `client/src/debug/GpuMemoryEstimator.ts:125`
**Scope**: Full scene (`scene.traverse()`)
**Call Frequency**: On demand (debug tool)

```typescript
scene.traverse((object) => {
    // Check for InstancedMesh
    // Check for materials with textures
})
```

**Impact**: Low - Debug tool, only run manually
**Recommendation**: Acceptable for debug tool, but could add caching if called frequently

---

#### 6. `GameFinder.findAll()` and `GameFinder.find()`
**File**: `client/src/debug/GameFinder.ts:106, 186`
**Scope**: Full scene (`this.scene.traverse()`)
**Call Frequency**: On demand (debug tool, console commands)

```typescript
this.scene.traverse((child) => {
    const game = this.extractGameObject(child)
    if (game) games.push(game)
})
```

**Impact**: Low - Debug tool only
**Recommendation**: Acceptable for debug tool. Note: Already checks instanced metadata first, scene traverse is fallback for legacy meshes.

---

### 🟡 MEDIUM PRIORITY (Scoped Group Traversal)

#### 7. `LightingRenderer.toggleLighting()`
**File**: `client/src/scene/LightingRenderer.ts:503`
**Scope**: `lightingGroup` only (NOT full scene)
**Call Frequency**: On user toggle

```typescript
this.lightingGroup.traverse((child) => {
    if (child instanceof THREE.Light) {
        child.visible = enabled
    }
})
```

**Impact**: Low - Limited to lighting group children (~10-50 objects)
**Status**: ✅ Appropriately scoped

---

#### 8. `LightingRenderer.refreshShadows()`
**File**: `client/src/scene/LightingRenderer.ts:524`
**Scope**: `lightingGroup` only
**Call Frequency**: On `SceneCoordinator.onPropsAddedEvent()` → once after all props placed

```typescript
this.lightingGroup.traverse((child) => {
    if (child instanceof THREE.DirectionalLight && child.castShadow) {
        // Update shadow camera
    }
})
```

**Impact**: Low - Limited scope, called once after props load
**Status**: ✅ Appropriately scoped

---

#### 9. `LightingRenderer.getLightingStats()`
**File**: `client/src/scene/LightingRenderer.ts:583`
**Scope**: `lightingGroup` only
**Call Frequency**: Debug stats requests

```typescript
this.lightingGroup.traverse((child) => {
    if (child instanceof THREE.Light) {
        lightTypes.push(...)
    }
})
```

**Impact**: Low - Limited scope
**Status**: ✅ Appropriately scoped

---

#### 10. `LightingDebugHelper.addHelpersForLightGroup()`
**File**: `client/src/scene/LightingDebugHelper.ts:117`
**Scope**: Passed `lightGroup` only
**Call Frequency**: When debug visualization enabled

```typescript
lightGroup.traverse((child) => {
    if (child instanceof THREE.PointLight) { ... }
})
```

**Impact**: Low - Limited scope
**Status**: ✅ Appropriately scoped

---

### 🟢 LOW PRIORITY (One-Time or Cleanup Operations)

#### 11. `RoomManager.dispose()`
**File**: `client/src/scene/RoomManager.ts:316`
**Scope**: `roomGroup` only
**Call Frequency**: On dispose (cleanup)

```typescript
this.roomGroup.traverse((child) => {
    if (child instanceof THREE.Mesh) {
        child.geometry?.dispose()
        child.material.dispose()
    }
})
```

**Impact**: None - Cleanup operation
**Status**: ✅ Appropriate

---

#### 12. `AssetLoader.enableShadowsForModel()`
**File**: `client/src/scene/AssetLoader.ts:101`
**Scope**: Loaded model only
**Call Frequency**: Once per loaded model

```typescript
model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
        child.castShadow = true
        child.receiveShadow = true
    }
})
```

**Impact**: Low - One-time per model load
**Status**: ✅ Appropriate

---

#### 13. `ShelfSurfaceUtils.findDynamicShelfSurfaces()`
**File**: `client/src/scene/props/shared/ShelfSurfaceUtils.ts:40`
**Scope**: Individual `shelfUnit` only
**Call Frequency**: Once per shelf placement

```typescript
shelfUnit.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry instanceof THREE.BoxGeometry) {
        // Find shelf surfaces
    }
})
```

**Impact**: Low - Limited scope, one-time
**Status**: ✅ Appropriate

---

### ✅ ALREADY OPTIMIZED (Good Pattern)

#### 14. `DiagnosticSpotlight.getRectAreaLights()`
**File**: `client/src/debug/DiagnosticSpotlight.ts:272`
**Scope**: Full scene BUT with caching!

```typescript
private getRectAreaLights(): THREE.RectAreaLight[] {
    if (this.cachedRectAreaLights) {
        return this.cachedRectAreaLights  // ✅ Cache hit
    }

    const lights: THREE.RectAreaLight[] = []
    this.scene.traverse((object) => {
        if (object instanceof THREE.RectAreaLight) {
            lights.push(object)
        }
    })

    this.cachedRectAreaLights = lights  // ✅ Cache result
    return lights
}

public invalidateLightCache(): void {
    this.cachedRectAreaLights = null  // ✅ Manual invalidation
}
```

**Status**: ✅ **This is the pattern to follow!** Cache traverse results, invalidate on known structure changes.

---

## Recommendations

### Immediate Fixes (High Impact)

1. **LightingControlsPanel.scanLights()** - Add caching similar to `DiagnosticSpotlight`:
   ```typescript
   private cachedLights: Map<string, LightGroupInfo> | null = null
   
   private scanLights(): void {
       if (this.cachedLights) {
           this.lightGroups = this.cachedLights
           return
       }
       // ... existing traverse logic ...
       this.cachedLights = newGroups
   }
   
   private invalidateLightCache(): void {
       this.cachedLights = null
   }
   ```
   Then call `invalidateLightCache()` on `LightingEventTypes.Created` / removed.

2. **LightingControlsPanel.toggleDebugHelperForLight()** - Use `getObjectByName()`:
   ```typescript
   // Before (traverses entire scene)
   this.scene.traverse((object) => {
       if (object.name === debugHelperName) { ... }
   })
   
   // After (stops at first match)
   const debugHelper = this.scene.getObjectByName(debugHelperName)
   ```

3. **DebugStatsProvider.countSceneObjects()** - Add caching with TTL or event-based invalidation:
   ```typescript
   private cachedObjectCounts: { meshes: number; lights: number; cameras: number } | null = null
   private lastCountTime: number = 0
   private static readonly CACHE_TTL = 1000 // 1 second
   
   private countSceneObjects(scene: THREE.Scene) {
       const now = Date.now()
       if (this.cachedObjectCounts && now - this.lastCountTime < CACHE_TTL) {
           return this.cachedObjectCounts
       }
       // ... traverse and cache ...
   }
   ```

### Architecture Pattern

For any code that needs scene-wide queries:

1. **Prefer scoped traversal** - Traverse specific groups (`lightingGroup`, `propsGroup`) instead of full scene
2. **Cache results** - Especially for queries that return stable data
3. **Invalidate on structure change** - Listen for add/remove events to invalidate cache
4. **Use built-in methods** - `getObjectByName()`, `getObjectById()` when finding specific objects
5. **Consider event-driven registration** - Objects register themselves with a manager instead of being discovered via traversal

### Call Chain Summary

```
Startup:
  LightingControlsPanel constructor
    → performInitialScan()
      → scanLights()           ← 🔴 FULL SCENE TRAVERSE
    
  LightingEventTypes.Created (per light)
    → scanLights()             ← 🔴 FULL SCENE TRAVERSE (repeated!)

Debug Panel Open:
  DebugPanel.onShow()
    → debugStatsProvider.getDebugStats()
      → countSceneObjects()    ← 🔴 FULL SCENE TRAVERSE

User toggles lighting debug:
  toggleAllDebugHelpers()      ← 🔴 FULL SCENE TRAVERSE
  
Per-light debug toggle:
  toggleDebugHelperForLight()  ← 🔴 FULL SCENE TRAVERSE
```

---

## Estimated Impact

With a scene containing:
- ~800 game boxes (instanced, so actually ~10 mesh objects for instance groups)
- ~50 lights
- ~20 room elements (walls, floor, ceiling)
- ~50 shelf components
- ~20 debug helpers

**Total scene objects**: ~150-200 objects

Each `scene.traverse()` visits all ~200 objects. During startup with multiple `scanLights()` calls:
- 5+ traversals × 200 objects = 1000+ object visits

This isn't catastrophic, but with optimizations we could reduce to:
- 1 traverse for initial cache + incremental updates = ~200 object visits total

**Potential savings**: 80%+ reduction in traverse overhead during startup.
