# GPU Instanced Rendering with Texture Arrays - Implementation Plan

## 🎯 Goal
Render thousands of game box labels with minimal draw calls using GPU-side instancing and texture array sampling.

## 📊 Performance Impact
- **Current**: N game boxes = N draw calls for labels (1000 games = 1000+ draw calls)
- **With Instancing**: N game boxes = 1-2 draw calls total (1000 games = 2 draw calls)
- **Expected**: 500x-1000x reduction in draw calls for labels

## 🧠 Core Concepts

### What is InstancedMesh?
`THREE.InstancedMesh` renders many copies of the same geometry with one draw call. Each instance can have:
- Unique position/rotation/scale (via matrix)
- Unique attributes (via `InstancedBufferAttribute`)
- Access to different textures (via texture arrays + custom shaders)

### What are Texture Arrays?
A `THREE.DataArrayTexture` is a stack of 2D textures that the GPU can index into:
```
Texture Array [0] = "Half-Life 2" canvas
Texture Array [1] = "Portal" canvas  
Texture Array [2] = "Team Fortress 2" canvas
...
```

Shader samples from: `texture(textureArray, vec3(uv.x, uv.y, textureIndex))`

## 📝 Implementation Phases

---

## Phase 1: Simple Proof of Concept (30-60 min)
**Goal**: Get ONE InstancedMesh rendering 10 colored quads with different colors via instancing

### Files to Create/Modify
```
client/src/scene/game-box/instancing/
  ├── SimpleInstancedTest.ts          # Minimal POC
  └── shaders/
      ├── instancedLabel.vert.glsl    # Vertex shader
      └── instancedLabel.frag.glsl    # Fragment shader
```

### Step 1.1: Create Basic Vertex Shader
**File**: `instancedLabel.vert.glsl`
```glsl
// Pass instance color to fragment shader
attribute vec3 instanceColor;
varying vec3 vColor;
varying vec2 vUv;

void main() {
    vColor = instanceColor;
    vUv = uv;
    
    // Use instanced matrix for positioning
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
```

### Step 1.2: Create Basic Fragment Shader  
**File**: `instancedLabel.frag.glsl`
```glsl
varying vec3 vColor;
varying vec2 vUv;

void main() {
    // Simple colored quad for now
    gl_FragColor = vec4(vColor, 1.0);
}
```

### Step 1.3: Create Test Renderer
**File**: `SimpleInstancedTest.ts`
```typescript
import * as THREE from 'three'

export class SimpleInstancedTest {
    private instancedMesh: THREE.InstancedMesh
    
    constructor(scene: THREE.Scene, count: number = 10) {
        // 1. Create geometry (one plane for all instances)
        const geometry = new THREE.PlaneGeometry(0.3, 0.4)
        
        // 2. Create shader material with instancing
        const material = new THREE.ShaderMaterial({
            vertexShader: `
                attribute vec3 instanceColor;
                varying vec3 vColor;
                varying vec2 vUv;
                
                void main() {
                    vColor = instanceColor;
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                
                void main() {
                    gl_FragColor = vec4(vColor, 1.0);
                }
            `,
            side: THREE.DoubleSide
        })
        
        // 3. Create instanced mesh
        this.instancedMesh = new THREE.InstancedMesh(geometry, material, count)
        
        // 4. Set up per-instance data
        const colors = new Float32Array(count * 3) // RGB per instance
        for (let i = 0; i < count; i++) {
            // Random color per instance
            colors[i * 3 + 0] = Math.random()
            colors[i * 3 + 1] = Math.random()
            colors[i * 3 + 2] = Math.random()
            
            // Position matrix for this instance
            const matrix = new THREE.Matrix4()
            matrix.setPosition(
                (i % 5) * 0.5,      // X: spread horizontally
                Math.floor(i / 5) * 0.5, // Y: stack vertically
                0                    // Z
            )
            this.instancedMesh.setMatrixAt(i, matrix)
        }
        
        // 5. Add instance colors as attribute
        geometry.setAttribute('instanceColor', 
            new THREE.InstancedBufferAttribute(colors, 3)
        )
        
        this.instancedMesh.instanceMatrix.needsUpdate = true
        scene.add(this.instancedMesh)
        
        console.log('✅ Simple instanced test: 10 colored quads, 1 draw call')
    }
}
```

### Step 1.4: Test Integration
**File**: `SceneCoordinator.ts` (temporary test)
```typescript
// In setupBasicEnvironment() or similar:
import { SimpleInstancedTest } from './game-box/instancing/SimpleInstancedTest'

// Add after scene setup:
new SimpleInstancedTest(this.sceneManager.getScene(), 10)
```

### ✅ Phase 1 Success Criteria
- [ ] See 10 colored rectangles in the scene
- [ ] Each rectangle has a different random color
- [ ] Verify only 1 draw call in stats panel (press 'shift+2' or check renderer.info)
- [ ] No console errors

**Expected outcome**: Colored quads prove instancing works

---

## Phase 2: Texture Array Integration (1-2 hours)
**Goal**: Sample from a texture array instead of colors

### Step 2.1: Create Texture Array from Canvases
**File**: `LabelTextureArrayManager.ts`

**TEXTURE SOURCE NOTE**: 
- IndexedDB contains `gameImages` entries with URLs to actual game images
- These can be loaded and used directly instead of generating canvas text
- Alternative: Generate canvas-based text labels as fallback
- Manager should support both: URL-based image loading AND canvas-based text generation

```typescript
import * as THREE from 'three'

export class LabelTextureArrayManager {
    private textureArray: THREE.DataArrayTexture | null = null
    private canvases: HTMLCanvasElement[] = []
    private readonly TEXTURE_SIZE = 512
    
    /**
     * Create canvas with game name text
     */
    public createLabelCanvas(gameName: string): HTMLCanvasElement {
        const canvas = document.createElement('canvas')
        canvas.width = this.TEXTURE_SIZE
        canvas.height = this.TEXTURE_SIZE
        
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#000000'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 48px Arial'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(gameName, canvas.width / 2, canvas.height / 2)
        
        return canvas
    }
    
    /**
     * Build texture array from multiple canvases
     */
    public buildTextureArray(gameNames: string[]): THREE.DataArrayTexture {
        const count = gameNames.length
        console.log(`📦 Building texture array for ${count} labels`)
        
        // Create canvases
        this.canvases = gameNames.map(name => this.createLabelCanvas(name))
        
        // Create data array: width × height × depth × 4 (RGBA)
        const size = this.TEXTURE_SIZE
        const data = new Uint8Array(size * size * count * 4)
        
        // Copy each canvas into the array
        for (let i = 0; i < count; i++) {
            const ctx = this.canvases[i].getContext('2d')!
            const imageData = ctx.getImageData(0, 0, size, size)
            
            // Copy to correct layer in texture array
            const offset = i * size * size * 4
            data.set(imageData.data, offset)
        }
        
        // Create THREE.js texture array
        this.textureArray = new THREE.DataArrayTexture(data, size, size, count)
        this.textureArray.format = THREE.RGBAFormat
        this.textureArray.type = THREE.UnsignedByteType
        this.textureArray.needsUpdate = true
        
        console.log(`✅ Texture array created: ${size}×${size}×${count}`)
        return this.textureArray
    }
    
    public dispose(): void {
        this.textureArray?.dispose()
        this.canvases = []
    }
}
```

### Step 2.2: Update Shaders for Texture Sampling
**Vertex Shader**:
```glsl
attribute float textureIndex; // Which layer of texture array to sample
varying float vTextureIndex;
varying vec2 vUv;

void main() {
    vTextureIndex = textureIndex;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
```

**Fragment Shader**:
```glsl
uniform sampler2DArray textureArray; // The texture array uniform
varying float vTextureIndex;
varying vec2 vUv;

void main() {
    // Sample from texture array at specific layer
    vec4 texColor = texture(textureArray, vec3(vUv, vTextureIndex));
    gl_FragColor = texColor;
}
```

### Step 2.3: Update Test to Use Texture Array
```typescript
// In SimpleInstancedTest or new TextureArrayTest class:

// 1. Create texture array manager
const textureManager = new LabelTextureArrayManager()
const gameNames = ['Half-Life 2', 'Portal', 'Team Fortress 2', ...]
const textureArray = textureManager.buildTextureArray(gameNames)

// 2. Update material with texture array uniform
const material = new THREE.ShaderMaterial({
    uniforms: {
        textureArray: { value: textureArray }
    },
    vertexShader: `...`, // Updated vertex shader
    fragmentShader: `...`, // Updated fragment shader
    transparent: true,
    side: THREE.DoubleSide
})

// 3. Add textureIndex attribute (which layer to sample)
const textureIndices = new Float32Array(count)
for (let i = 0; i < count; i++) {
    textureIndices[i] = i % gameNames.length // Map to texture layer
}
geometry.setAttribute('textureIndex', 
    new THREE.InstancedBufferAttribute(textureIndices, 1)
)
```

### ✅ Phase 2 Success Criteria
- [ ] See game names rendered as textures on quads
- [ ] Each quad shows a different game name
- [ ] Still only 1 draw call
- [ ] Text is readable and clear

**Expected outcome**: Game names appear on instanced quads

---

## Phase 3: Integration with GameBoxRenderer (2-3 hours)
**Goal**: Replace current label system with instanced version

### Step 3.1: Create Production Class
**File**: `InstancedLabelRenderer.ts`
```typescript
export class InstancedLabelRenderer {
    private instancedMesh: THREE.InstancedMesh
    private textureArrayManager: LabelTextureArrayManager
    private geometry: THREE.PlaneGeometry
    private material: THREE.ShaderMaterial
    private maxInstances: number
    private currentCount: number = 0
    
    constructor(maxInstances: number = 2000) {
        this.maxInstances = maxInstances
        // Initialize geometry, material, instanced mesh
        // But don't populate until we have game data
    }
    
    /**
     * Initialize with actual game data
     */
    public initializeWithGames(games: SteamGameData[]): void {
        // 1. Build texture array from game names
        const gameNames = games.map(g => g.name)
        const textureArray = this.textureArrayManager.buildTextureArray(gameNames)
        
        // 2. Create material with texture array
        this.material = this.createLabelMaterial(textureArray)
        
        // 3. Create instanced mesh
        this.geometry = new THREE.PlaneGeometry(0.285, 0.38) // Slightly smaller than box
        this.instancedMesh = new THREE.InstancedMesh(
            this.geometry, 
            this.material, 
            this.maxInstances
        )
        
        // 4. Set up per-instance attributes
        this.setupInstanceAttributes()
    }
    
    /**
     * Set position and texture for a specific label instance
     */
    public setLabelInstance(
        index: number, 
        position: THREE.Vector3, 
        rotation: THREE.Quaternion,
        textureIndex: number
    ): void {
        if (index >= this.maxInstances) {
            console.warn(`Instance index ${index} exceeds max ${this.maxInstances}`)
            return
        }
        
        // Update matrix for this instance
        const matrix = new THREE.Matrix4()
        matrix.compose(position, rotation, new THREE.Vector3(1, 1, 1))
        this.instancedMesh.setMatrixAt(index, matrix)
        
        // Update texture index attribute
        const textureIndices = this.geometry.getAttribute('textureIndex') as THREE.InstancedBufferAttribute
        textureIndices.setX(index, textureIndex)
        
        this.currentCount = Math.max(this.currentCount, index + 1)
    }
    
    /**
     * Update GPU with all changes
     */
    public updateGPU(): void {
        this.instancedMesh.instanceMatrix.needsUpdate = true
        this.instancedMesh.count = this.currentCount // Only render active instances
        
        const textureIndices = this.geometry.getAttribute('textureIndex')
        if (textureIndices) {
            textureIndices.needsUpdate = true
        }
    }
    
    private createLabelMaterial(textureArray: THREE.DataArrayTexture): THREE.ShaderMaterial {
        return new THREE.ShaderMaterial({
            uniforms: {
                textureArray: { value: textureArray }
            },
            vertexShader: `
                attribute float textureIndex;
                varying float vTextureIndex;
                varying vec2 vUv;
                
                void main() {
                    vTextureIndex = textureIndex;
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2DArray textureArray;
                varying float vTextureIndex;
                varying vec2 vUv;
                
                void main() {
                    vec4 texColor = texture(textureArray, vec3(vUv, vTextureIndex));
                    gl_FragColor = texColor;
                }
            `,
            transparent: true,
            side: THREE.DoubleSide
        })
    }
    
    private setupInstanceAttributes(): void {
        // Texture indices (which layer each instance uses)
        const textureIndices = new Float32Array(this.maxInstances)
        this.geometry.setAttribute('textureIndex',
            new THREE.InstancedBufferAttribute(textureIndices, 1)
        )
    }
    
    public dispose(): void {
        this.geometry.dispose()
        this.material.dispose()
        this.textureArrayManager.dispose()
        this.instancedMesh.removeFromParent()
    }
}
```

### Step 3.2: Integrate with GameBoxRenderer
**File**: `GameBoxRenderer.ts`
```typescript
// Add field:
private labelRenderer?: InstancedLabelRenderer

// In constructor or separate init:
public initializeLabelRenderer(games: SteamGameData[]): void {
    this.labelRenderer = new InstancedLabelRenderer(games.length)
    this.labelRenderer.initializeWithGames(games)
}

// Replace addGameNameLabel() with:
private addGameNameLabelInstanced(
    gameBox: THREE.Mesh, 
    gameIndex: number
): void {
    if (!this.labelRenderer) {
        console.warn('Label renderer not initialized')
        return
    }
    
    // Calculate label position relative to game box
    const labelPos = new THREE.Vector3(
        gameBox.position.x,
        gameBox.position.y,
        gameBox.position.z + (this.dimensions.depth / 2) + 0.001
    )
    
    const labelRot = new THREE.Quaternion()
    gameBox.getWorldQuaternion(labelRot)
    
    // Set this label instance
    this.labelRenderer.setLabelInstance(
        gameIndex,  // Instance index
        labelPos,   // World position
        labelRot,   // World rotation
        gameIndex   // Texture array index (same as game index)
    )
}

// After creating all game boxes:
public finalizeLabels(): void {
    this.labelRenderer?.updateGPU()
}
```

### Step 3.3: Update StorePropsRenderer
```typescript
// After creating all game boxes on a shelf:
private async spawnActualGamesOnShelf(...): Promise<void> {
    // ... existing game box creation ...
    
    // After all boxes created, initialize label renderer once
    if (!this.gameBoxRenderer.hasLabelRenderer()) {
        this.gameBoxRenderer.initializeLabelRenderer(allGames)
    }
    
    // Set labels for this shelf's games
    // ... (GameBoxRenderer handles this)
    
    // Update GPU after batch
    this.gameBoxRenderer.finalizeLabels()
}
```

### ✅ Phase 3 Success Criteria
- [ ] All game boxes have labels
- [ ] Labels show correct game names
- [ ] Only 1-2 draw calls for ALL labels (check renderer.info)
- [ ] No performance degradation
- [ ] Labels move with game boxes

---

## Phase 4: Optimization & Polish (1-2 hours)

### Dynamic Updates
Handle adding/removing games dynamically:
```typescript
public updateLabelText(instanceIndex: number, newGameName: string): void {
    // Regenerate canvas for this game
    // Update specific layer in texture array
    // Mark texture as needing update
}
```

### Level of Detail (LOD)
```typescript
// In fragment shader, sample lower mip levels at distance:
float lod = length(vPosition - cameraPosition) * 0.1;
vec4 texColor = textureLod(textureArray, vec3(vUv, vTextureIndex), lod);
```

### Frustum Culling
```typescript
// Three.js handles InstancedMesh frustum culling automatically
// But we can optimize further by updating instance count:
this.instancedMesh.count = visibleInstanceCount
```

---

## 🧪 Testing Strategy

### Phase 1 Testing
```typescript
// Test file: test/unit/scene/instancing/simple-instanced-test.test.ts
describe('Simple Instanced Test', () => {
    it('should create 10 instances with 1 draw call', () => {
        const test = new SimpleInstancedTest(scene, 10)
        // Verify renderer.info.render.calls === 1
    })
})
```

### Phase 2 Testing
```typescript
describe('Texture Array Manager', () => {
    it('should build texture array from game names', () => {
        const manager = new LabelTextureArrayManager()
        const textureArray = manager.buildTextureArray(['Game 1', 'Game 2'])
        expect(textureArray.image.depth).toBe(2)
    })
})
```

### Phase 3 Testing
```typescript
describe('Instanced Label Integration', () => {
    it('should render 100 labels with 1 draw call', () => {
        // Create 100 game boxes
        // Verify all have labels
        // Check draw call count
    })
})
```

---

## 📈 Performance Metrics to Track

Before vs After:
```
Draw Calls:
  Before: 1000 game boxes = 1000+ label draw calls
  After:  1000 game boxes = 1-2 label draw calls

Memory:
  Before: 1000 materials × ~1KB = ~1MB
  After:  1 material + texture array (~2-4MB for 1000 textures)

Frame Time:
  Before: ~16ms (60fps → ~45fps with labels)
  After:  ~8ms (60fps maintained)
```

---

## 🚨 Potential Gotchas

### 1. Texture Array Size Limits
```typescript
// Check max texture size
const gl = renderer.getContext()
const maxLayers = gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS)
console.log(`Max texture array layers: ${maxLayers}`) // Usually 256-2048

// If too many games, split into multiple instanced meshes
```

### 2. WebGL 2.0 Requirement
```typescript
// Texture arrays require WebGL 2.0
if (!renderer.capabilities.isWebGL2) {
    console.warn('Texture arrays require WebGL 2.0, falling back')
    // Use fallback implementation
}
```

### 3. Instance Count Updates
```typescript
// When hiding instances, update count, don't keep hidden instances:
this.instancedMesh.count = visibleCount // Not maxInstances
```

---

## 📚 Resources

- [THREE.InstancedMesh Docs](https://threejs.org/docs/#api/en/objects/InstancedMesh)
- [THREE.DataArrayTexture Docs](https://threejs.org/docs/#api/en/textures/DataArrayTexture)
- [InstancedBufferAttribute Docs](https://threejs.org/docs/#api/en/core/InstancedBufferAttribute)
- [WebGL 2.0 Texture Arrays](https://webgl2fundamentals.org/webgl/lessons/webgl-data-textures.html)

---

## 🎯 Next Steps

1. **Start with Phase 1** - Get colored quads working (30 min)
2. **Validate** - Confirm 1 draw call for 10 instances
3. **Move to Phase 2** - Add texture array (1-2 hours)
4. **Validate** - Confirm game names appear correctly
5. **Phase 3** - Integrate with production code (2-3 hours)
6. **Phase 4** - Polish and optimize (1-2 hours)

**Total Estimated Time**: 6-10 hours for full implementation

---

## 💡 Alternative: Hybrid Approach

If texture arrays prove too complex initially, consider:
- Use instancing for positioning (InstancedMesh)
- But keep individual materials with textures
- Still get batching benefits for geometry
- ~50% improvement vs current, easier to implement

This gives us time to learn instancing without tackling texture arrays immediately.
