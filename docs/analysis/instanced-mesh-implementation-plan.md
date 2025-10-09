# InstancedMesh Implementation Plan

## Overview
This document outlines the implementation plan for Three.js InstancedMesh to achieve our target of reducing draw calls from **3350 to ~50**, building on the shared resource architecture we've established with SharedMaterialManager.

## Current Performance Baseline

### Before Optimization
- **Draw Calls**: 3350
- **Geometries**: 2163  
- **Materials**: 2373 → **20** (✅ COMPLETED via SharedMaterialManager)
- **Target**: ~50 draw calls total

### Analysis
The SharedMaterialManager successfully consolidated materials, but we still have **2163 geometries** creating individual draw calls. InstancedMesh will consolidate these geometries into batched instances.

## InstancedMesh Strategy

### Core Concept
Instead of creating individual `THREE.Mesh` objects for each game box, we'll create a single `THREE.InstancedMesh` that renders many instances with a single draw call.

### Architecture Changes

#### Current Pattern (Individual Meshes)
```typescript
// GameBoxRenderer.ts - Current approach
for (let i = 0; i < games.length; i++) {
  const gameBox = new THREE.Mesh(this.gameBoxGeometry, material)
  gameBox.position.set(x, y, z)
  scene.add(gameBox)
  // Result: 1 draw call per game box
}
```

#### Target Pattern (InstancedMesh)
```typescript
// GameBoxRenderer.ts - InstancedMesh approach
const instancedGameBoxes = new THREE.InstancedMesh(
  this.gameBoxGeometry,
  this.sharedMaterial, 
  games.length // Max instance count
)

// Set instance transformations
for (let i = 0; i < games.length; i++) {
  const matrix = new THREE.Matrix4()
  matrix.makeTranslation(x, y, z)
  instancedGameBoxes.setMatrixAt(i, matrix)
}
instancedGameBoxes.instanceMatrix.needsUpdate = true
scene.add(instancedGameBoxes)
// Result: 1 draw call for ALL game boxes
```

## Implementation Phases

### Phase 1: Single Material InstancedMesh (Week 1)

#### 1.1: Create InstancedGameBoxManager
```typescript
// New: InstancedGameBoxManager.ts
export class InstancedGameBoxManager {
  private instancedMesh: THREE.InstancedMesh
  private maxInstances: number
  private currentInstanceCount: number = 0
  private gameDataMap: Map<number, GameData> = new Map()

  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    maxInstances: number = 1000
  ) {
    this.maxInstances = maxInstances
    this.instancedMesh = new THREE.InstancedMesh(geometry, material, maxInstances)
    this.instancedMesh.userData = { isGameBoxInstanced: true }
  }

  public addGameBox(
    gameData: GameData, 
    position: THREE.Vector3, 
    rotation?: THREE.Euler
  ): number {
    if (this.currentInstanceCount >= this.maxInstances) {
      throw new Error('Exceeded max instances')
    }

    const instanceId = this.currentInstanceCount
    
    // Create transformation matrix
    const matrix = new THREE.Matrix4()
    matrix.makeRotationFromEuler(rotation || new THREE.Euler())
    matrix.setPosition(position)
    
    this.instancedMesh.setMatrixAt(instanceId, matrix)
    this.gameDataMap.set(instanceId, gameData)
    
    this.currentInstanceCount++
    this.instancedMesh.instanceMatrix.needsUpdate = true
    
    return instanceId
  }

  public updateGameBoxPosition(instanceId: number, position: THREE.Vector3): void {
    const matrix = new THREE.Matrix4()
    this.instancedMesh.getMatrixAt(instanceId, matrix)
    matrix.setPosition(position)
    this.instancedMesh.setMatrixAt(instanceId, matrix)
    this.instancedMesh.instanceMatrix.needsUpdate = true
  }

  public getInstancedMesh(): THREE.InstancedMesh {
    return this.instancedMesh
  }
}
```

#### 1.2: Update GameBoxRenderer
```typescript
// GameBoxRenderer.ts - Modified for InstancedMesh
export class GameBoxRenderer {
  private instancedGameBoxManager: InstancedGameBoxManager
  private defaultMaterial: THREE.MeshStandardMaterial

  constructor(/*...*/) {
    // Use a single default material for all instances
    this.defaultMaterial = this.materialManager.getGameBoxMaterial(0.5) // Mid-range hue
    
    this.instancedGameBoxManager = new InstancedGameBoxManager(
      this.gameBoxGeometry,
      this.defaultMaterial,
      1000 // Max game boxes
    )
  }

  public createGameBoxesFromBatch(
    scene: THREE.Scene,
    request: GameBoxBatchCreationRequest
  ): THREE.InstancedMesh {
    const { games } = request
    
    // Clear previous instances if needed
    scene.remove(this.instancedGameBoxManager.getInstancedMesh())
    
    // Add all game boxes as instances
    games.forEach((game, index) => {
      const position = this.calculateBoxPosition(index, 0, config)
      this.instancedGameBoxManager.addGameBox(game, position)
    })
    
    // Add the single instanced mesh to scene
    const instancedMesh = this.instancedGameBoxManager.getInstancedMesh()
    scene.add(instancedMesh)
    
    console.log(`✅ Created ${games.length} game boxes in 1 draw call`)
    return instancedMesh
  }
}
```

**Expected Result**: Reduce game box draw calls from ~100-500 to 1

### Phase 2: Multi-Material InstancedMesh (Week 2)

#### 2.1: Material-Based Batching
Since we have ~20 shared materials, create separate InstancedMesh for each material:

```typescript
// Enhanced: InstancedGameBoxManager.ts
export class InstancedGameBoxManager {
  private materialBatches: Map<string, {
    instancedMesh: THREE.InstancedMesh,
    currentCount: number,
    gameDataMap: Map<number, GameData>
  }> = new Map()

  public addGameBoxWithMaterial(
    gameData: GameData,
    position: THREE.Vector3,
    material: THREE.Material
  ): { batchId: string, instanceId: number } {
    const materialId = this.getMaterialId(material)
    
    if (!this.materialBatches.has(materialId)) {
      this.createMaterialBatch(materialId, material)
    }
    
    const batch = this.materialBatches.get(materialId)!
    const instanceId = batch.currentCount
    
    // Set instance transformation
    const matrix = new THREE.Matrix4()
    matrix.setPosition(position)
    batch.instancedMesh.setMatrixAt(instanceId, matrix)
    batch.gameDataMap.set(instanceId, gameData)
    
    batch.currentCount++
    batch.instancedMesh.instanceMatrix.needsUpdate = true
    
    return { batchId: materialId, instanceId }
  }

  private createMaterialBatch(materialId: string, material: THREE.Material): void {
    const instancedMesh = new THREE.InstancedMesh(
      this.geometry,
      material,
      this.maxInstancesPerMaterial
    )
    
    this.materialBatches.set(materialId, {
      instancedMesh,
      currentCount: 0,
      gameDataMap: new Map()
    })
  }

  public getMeshes(): THREE.InstancedMesh[] {
    return Array.from(this.materialBatches.values()).map(batch => batch.instancedMesh)
  }
}
```

**Expected Result**: Reduce game box draw calls to ~20 (one per material)

### Phase 3: Full Scene InstancedMesh (Week 3)

#### 3.1: Extend to Other Scene Elements

Apply InstancedMesh to other repetitive elements:

```typescript
// New: InstancedShelfManager.ts - For shelf components
// New: InstancedPropManager.ts - For store props
// New: InstancedLightingManager.ts - For light fixtures
```

#### 3.2: Scene-Level Batching Coordinator
```typescript
// New: SceneInstanceCoordinator.ts
export class SceneInstanceCoordinator {
  private gameBoxManager: InstancedGameBoxManager
  private shelfManager: InstancedShelfManager
  private propManager: InstancedPropManager

  public batchAllSceneElements(scene: THREE.Scene): void {
    // Coordinate all instanced elements
    const gameBoxMeshes = this.gameBoxManager.getMeshes()
    const shelfMeshes = this.shelfManager.getMeshes()
    const propMeshes = this.propManager.getMeshes()
    
    gameBoxMeshes.forEach(mesh => scene.add(mesh))
    shelfMeshes.forEach(mesh => scene.add(mesh))
    propMeshes.forEach(mesh => scene.add(mesh))
    
    console.log(`🎯 Total draw calls: ${gameBoxMeshes.length + shelfMeshes.length + propMeshes.length}`)
  }
}
```

## Technical Challenges & Solutions

### Challenge 1: Individual Game Box Interaction
**Problem**: With InstancedMesh, we lose individual mesh references for click/VR interaction.

**Solution**: Use raycasting with instance IDs:
```typescript
// InteractionManager.ts - Enhanced for InstancedMesh
public handleGameBoxClick(event: MouseEvent): void {
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(mouse, camera)
  
  const intersects = raycaster.intersectObject(instancedGameBoxes)
  if (intersects.length > 0) {
    const instanceId = intersects[0].instanceId
    const gameData = this.gameBoxManager.getGameDataForInstance(instanceId)
    // Handle interaction with specific game
  }
}
```

### Challenge 2: Dynamic Game Box Updates
**Problem**: Adding/removing games dynamically with InstancedMesh is complex.

**Solution**: Implement instance pooling:
```typescript
// InstancedGameBoxManager.ts - Dynamic updates
public hideInstance(instanceId: number): void {
  // Move instance far away instead of removing
  const matrix = new THREE.Matrix4()
  matrix.setPosition(new THREE.Vector3(10000, 10000, 10000))
  this.instancedMesh.setMatrixAt(instanceId, matrix)
  this.instancedMesh.instanceMatrix.needsUpdate = true
}

public showInstance(instanceId: number, position: THREE.Vector3): void {
  const matrix = new THREE.Matrix4()
  matrix.setPosition(position)
  this.instancedMesh.setMatrixAt(instanceId, matrix)
  this.instancedMesh.instanceMatrix.needsUpdate = true
}
```

### Challenge 3: Material Variation
**Problem**: Game boxes need different colors/textures per game.

**Solution**: Use instance attributes for color variation:
```typescript
// InstancedGameBoxManager.ts - Per-instance colors
private setupInstanceColors(): void {
  const colors = new Float32Array(this.maxInstances * 3)
  
  for (let i = 0; i < this.maxInstances; i++) {
    const color = new THREE.Color().setHSL(Math.random(), 0.7, 0.5)
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }
  
  this.instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3)
}

// Shader modification to use instance colors
const vertexShader = `
  attribute vec3 instanceColor;
  varying vec3 vInstanceColor;
  
  void main() {
    vInstanceColor = instanceColor;
    // ... rest of vertex shader
  }
`
```

## Integration with Existing Architecture

### Dependency Chain
1. **SharedMaterialManager** (✅ COMPLETED) → Provides shared materials
2. **GameBoxRenderer Factory** (📋 PLANNED) → Ensures single geometry source
3. **InstancedGameBoxManager** (📋 THIS PLAN) → Batches geometry instances

### Event System Compatibility
```typescript
// Maintain event system for game interactions
public handleGameBoxSelection(instanceId: number): void {
  const gameData = this.instancedGameBoxManager.getGameDataForInstance(instanceId)
  
  // Emit existing game events
  this.eventManager.emit(GameEventTypes.Selected, {
    gameData,
    instanceId,
    position: this.getInstancePosition(instanceId)
  })
}
```

## Performance Targets

### Draw Call Reduction
- **Current**: 3350 total draw calls
- **Phase 1**: ~3250 (100 game box calls → 1)
- **Phase 2**: ~3230 (100 game box calls → 20 material batches)  
- **Phase 3**: ~50 total (full scene batching)

### Memory Impact
- **Positive**: Reduced mesh objects from ~500 to ~20
- **Negative**: InstancedMesh overhead ~2-5MB per batch
- **Net**: Significant memory reduction

### VR Performance
- **Target**: 90fps stable in VR with 500+ game boxes
- **Metrics**: Frame time <11ms consistently

## Testing Strategy

### Performance Testing
```typescript
// test/performance/instanced-rendering.test.ts
describe('InstancedMesh Performance', () => {
  it('should handle 1000 game boxes in <5 draw calls', () => {
    // Performance benchmarking
  })

  it('should maintain 90fps in VR simulation', () => {
    // VR performance testing  
  })
})
```

### Functionality Testing
```typescript
// test/unit/InstancedGameBoxManager.test.ts
describe('InstancedGameBoxManager', () => {
  it('should handle individual game box selection', () => {
    // Interaction testing
  })

  it('should support dynamic game box updates', () => {
    // Dynamic content testing
  })
})
```

## Migration Path

### Step 1: Feature Flag Implementation
```typescript
// GameBoxRenderer.ts - Gradual migration
constructor(options: { useInstancedMesh?: boolean } = {}) {
  this.useInstancedMesh = options.useInstancedMesh ?? false
  // Initialize both systems initially
}

public createGameBoxesFromBatch(scene: THREE.Scene, request: GameBoxBatchCreationRequest) {
  if (this.useInstancedMesh) {
    return this.createInstancedGameBoxes(scene, request)
  } else {
    return this.createTraditionalGameBoxes(scene, request)
  }
}
```

### Step 2: A/B Testing
- Enable InstancedMesh for performance testing
- Compare draw calls and frame rates
- Validate interaction functionality

### Step 3: Full Migration
- Remove traditional mesh creation code
- Update all calling code to handle InstancedMesh returns
- Clean up legacy interaction code

## Success Criteria

### Primary Goals
- ✅ **Draw Calls**: Reduce from 3350 to ~50
- ✅ **Performance**: Maintain 90fps VR performance with 500+ objects
- ✅ **Functionality**: Preserve all existing game box interactions

### Secondary Goals
- **Memory**: Reduce mesh-related memory usage by 70%
- **Maintainability**: Cleaner, more efficient rendering architecture
- **Scalability**: Support 2000+ game boxes without performance degradation

## Timeline

### Week 1: Foundation
- [ ] Implement InstancedGameBoxManager
- [ ] Create basic single-material batching
- [ ] Update GameBoxRenderer integration
- [ ] Basic performance testing

### Week 2: Enhancement
- [ ] Multi-material batching system
- [ ] Dynamic instance management
- [ ] Interaction system updates
- [ ] Comprehensive testing

### Week 3: Optimization
- [ ] Extend to other scene elements
- [ ] Scene-level batching coordinator
- [ ] VR performance validation
- [ ] Final performance measurements

### Week 4: Migration
- [ ] A/B testing against traditional meshes
- [ ] Performance validation
- [ ] Full production migration
- [ ] Documentation updates

This implementation plan builds directly on our SharedMaterialManager success and addresses the core performance bottleneck of individual mesh draw calls. The phased approach ensures we can validate each step while maintaining functionality.