# Shared Geometry and Instancing Architecture

## Overview

This document outlines the architecture for implementing geometry sharing and instancing to reduce draw calls from ~2,500 to ~50, while maintaining visual quality and game-specific customization.

## Architecture Components

### 1. GeometryPool - Shared Geometry Management

```typescript
interface GeometryPool {
  // Game box geometries (already optimized)
  gameBox: THREE.BoxGeometry
  
  // Shelf component geometries
  shelfBoard: THREE.BoxGeometry      // Horizontal shelves
  angledBoard: THREE.BoxGeometry     // Front/back angled boards  
  supportBoard: THREE.BoxGeometry    // Side support posts
  interiorSurface: THREE.BoxGeometry // Shelf interior surfaces
}

class SharedGeometryManager {
  private static instance: SharedGeometryManager
  private geometryPool: GeometryPool
  
  public getGameBoxGeometry(): THREE.BoxGeometry
  public getShelfGeometry(type: ShelfComponentType): THREE.BoxGeometry
  public dispose(): void
}
```

### 2. MaterialPool - Shared Material Management

```typescript
interface MaterialPool {
  // Game box materials (hue-based pooling)
  gameBoxMaterials: Map<number, THREE.MeshStandardMaterial>  // Keyed by hue
  
  // Shelf materials (fully shared)
  mdfVeneer: THREE.MeshStandardMaterial
  shelfInterior: THREE.MeshStandardMaterial
  brandAccent: THREE.MeshStandardMaterial
}

class SharedMaterialManager {
  private static instance: SharedMaterialManager
  private materialPool: MaterialPool
  
  public getGameBoxMaterial(hue: number): THREE.MeshStandardMaterial
  public getShelfMaterial(type: ShelfMaterialType): THREE.MeshStandardMaterial
  public dispose(): void
}
```

### 3. InstancedMesh System for Shelf Components

```typescript
interface ShelfInstanceManager {
  // Batched shelf components
  horizontalShelves: THREE.InstancedMesh
  angledBoards: THREE.InstancedMesh
  supportPosts: THREE.InstancedMesh
  
  addShelfUnit(position: THREE.Vector3, options: ShelfOptions): void
  updateInstance(instanceId: number, transform: THREE.Matrix4): void
}

class ShelfBatchRenderer {
  private instanceManagers: Map<string, THREE.InstancedMesh>
  private instanceCounts: Map<string, number>
  
  public createShelfUnit(position: THREE.Vector3): void
  public finalizeInstances(): void
}
```

## Implementation Strategy

### Phase 1: Geometry Sharing (Low Risk)

**Goal**: Reduce geometry instances from 2,500+ to ~10

1. **GameBoxRenderer Refactor**:
   ```typescript
   // Current: Each box creates geometry
   const gameBox = new THREE.Mesh(this.gameBoxGeometry, material)
   
   // New: All boxes share single geometry
   const sharedGeometry = SharedGeometryManager.getInstance().getGameBoxGeometry()
   const gameBox = new THREE.Mesh(sharedGeometry, material)
   ```

2. **ProceduralShelfGenerator Refactor**:
   ```typescript
   // Current: Each shelf creates geometries
   const shelfGeometry = new THREE.BoxGeometry(width, thickness, depth)
   
   // New: Shared standard geometries
   const sharedGeometry = SharedGeometryManager.getInstance().getShelfGeometry('horizontal')
   const shelf = new THREE.Mesh(sharedGeometry, material)
   shelf.scale.set(scaleX, scaleY, scaleZ) // Adjust size via scaling
   ```

### Phase 2: Material Pooling (Medium Risk)

**Goal**: Reduce material instances from 2,500 to ~50

1. **Game Box Material Pooling**:
   ```typescript
   // Create limited palette of game box materials
   const GAME_BOX_HUES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]
   
   // Map game names to nearest hue in palette
   const nearestHue = findNearestHue(ValidationUtils.stringToHue(game.name))
   const material = SharedMaterialManager.getInstance().getGameBoxMaterial(nearestHue)
   ```

2. **Shelf Material Sharing**:
   ```typescript
   // Single material instances for all shelves
   const mdfMaterial = SharedMaterialManager.getInstance().getShelfMaterial('mdfVeneer')
   const shelf = new THREE.Mesh(sharedGeometry, mdfMaterial)
   ```

### Phase 3: InstancedMesh Batching (Higher Risk)

**Goal**: Reduce draw calls from 2,500+ to ~20

1. **Shelf Component Batching**:
   ```typescript
   // Batch identical shelf components
   const horizontalShelfInstances = new THREE.InstancedMesh(
     sharedGeometry,
     sharedMaterial,
     maxShelfCount * 4 // 4 horizontal shelves per unit
   )
   
   // Position instances via matrix transforms
   shelf.setMatrixAt(instanceIndex, transformMatrix)
   ```

2. **Game Box Instancing** (Optional):
   ```typescript
   // If material palette is small enough, batch by material
   const redGameBoxInstances = new THREE.InstancedMesh(
     gameBoxGeometry,
     redMaterial,
     countOfRedGames
   )
   ```

## Performance Targets

### Before Optimization
- **Materials**: ~2,500 unique instances
- **Geometries**: ~2,500+ instances  
- **Draw Calls**: ~2,500+ per frame
- **Memory**: High material/geometry overhead

### After Phase 1 (Geometry Sharing)
- **Materials**: ~2,500 (unchanged)
- **Geometries**: ~10 shared instances
- **Draw Calls**: ~2,500 (unchanged)
- **Memory**: 95%+ geometry memory reduction

### After Phase 2 (Material Pooling)  
- **Materials**: ~50 pooled instances
- **Geometries**: ~10 shared instances
- **Draw Calls**: ~50-100 (limited by material batching)
- **Memory**: 95%+ material memory reduction

### After Phase 3 (InstancedMesh)
- **Materials**: ~10 batched instances
- **Geometries**: ~10 shared instances  
- **Draw Calls**: ~20 per frame
- **Memory**: 99%+ reduction in overhead
- **Performance**: 60fps+ in VR with 2,500 games

## Implementation Considerations

### Game Boxes
- **Keep unique materials** for game-specific colors/artwork
- **Share geometry** completely (already done)
- **Material pooling** with limited palette for similar colors
- **Instancing** only if material palette is small enough

### Shelf Components
- **Share everything**: geometry, materials, transforms
- **InstancedMesh** ideal for identical structural components
- **Position/rotation** via instance matrices
- **Maximum batching** potential due to identical appearance

### Backward Compatibility
- **Preserve existing APIs** in GameBoxRenderer and ProceduralShelfGenerator
- **Internal optimization** transparent to calling code
- **Gradual migration** with feature flags for safe testing

### Memory Management
- **Dispose unused resources** when switching scenes
- **Reference counting** for shared resources
- **Lazy loading** of geometry/material pools

## Testing Strategy

1. **Unit Tests**: Verify shared resource creation and disposal
2. **Performance Tests**: Measure draw calls, memory usage, frame rates
3. **Visual Tests**: Ensure identical appearance before/after optimization
4. **Integration Tests**: Test with large game libraries (2,500+ games)
5. **VR Tests**: Validate performance in WebXR environments

## Risk Mitigation

1. **Phase 1 (Low Risk)**: Geometry sharing has minimal visual impact
2. **Phase 2 (Medium Risk)**: Material pooling needs careful color mapping
3. **Phase 3 (Higher Risk)**: InstancedMesh requires significant architecture changes
4. **Rollback Plan**: Feature flags allow reverting to original implementation
5. **A/B Testing**: Compare performance with/without optimizations

This architecture provides a clear path to achieve the goal of dropping draw calls to near zero while maintaining the visual quality and customization needed for the Steam game library display.