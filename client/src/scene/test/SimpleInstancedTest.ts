/**
 * Simple Instanced Test - Phase 1 & 2 POC
 * 
 * Proof of concept for GPU-side instanced rendering.
 * Renders multiple quads with a single draw call using THREE.InstancedMesh.
 * 
 * Phase 1: Colored quads (no textures)
 * Phase 2: Texture array sampling (optional textureArray parameter)
 * 
 * - Goal: Verify instancing and texture arrays work
 * - Expected: N instances = 1 draw call (vs N draw calls without instancing)
 */

import * as THREE from 'three'

export interface SimpleInstancedTestConfig {
    /** Number of instances to create */
    count?: number
    /** Optional texture array for Phase 2 testing */
    textureArray?: THREE.DataArrayTexture
    /** Labels for texture indices (must match textureArray layer count) */
    labels?: string[]
}

export class SimpleInstancedTest {
    private instancedMesh: THREE.InstancedMesh
    private scene: THREE.Scene
    private count: number
    private textureArray?: THREE.DataArrayTexture
    private useTextures: boolean

    constructor(scene: THREE.Scene, config: SimpleInstancedTestConfig | number = 10) {
        this.scene = scene
        
        // Support both old (number) and new (config) API
        if (typeof config === 'number') {
            this.count = config
            this.useTextures = false
        } else {
            this.count = config.count || 10
            this.textureArray = config.textureArray
            this.useTextures = !!config.textureArray
        }
        
        const mode = this.useTextures ? 'Phase 2: Texture Arrays' : 'Phase 1: Colored Quads'
        console.log(`🧪 [SimpleInstancedTest] Creating ${this.count} instanced quads (${mode})`)
        
        // 1. Create geometry (one plane shared by all instances)
        const geometry = new THREE.PlaneGeometry(0.3, 0.4)
        
        // 2. Create shader material with instancing support
        const material = this.createMaterial()
        
        // 3. Create instanced mesh
        this.instancedMesh = new THREE.InstancedMesh(geometry, material, this.count)
        this.instancedMesh.name = 'simple-instanced-test'
        
        // 4. Set up per-instance data
        this.setupInstanceData()
        
        // 5. Add to scene
        this.scene.add(this.instancedMesh)
        
        console.log(`✅ [SimpleInstancedTest] Created ${this.count} instances with 1 draw call`)
        if (this.useTextures) {
            console.log('🖼️ [SimpleInstancedTest] Using texture array sampling')
        } else {
            console.log('🎨 [SimpleInstancedTest] Using random colors')
        }
    }

    private createMaterial(): THREE.ShaderMaterial {
        const uniforms: Record<string, THREE.IUniform> = {}
        
        // Add texture array uniform if using textures
        if (this.useTextures && this.textureArray) {
            uniforms.textureArray = { value: this.textureArray }
        }
        
        return new THREE.ShaderMaterial({
            uniforms,
            vertexShader: this.getVertexShader(),
            fragmentShader: this.getFragmentShader(),
            side: THREE.DoubleSide,
            transparent: true
        })
    }

    private setupInstanceData(): void {
        const geometry = this.instancedMesh.geometry as THREE.BufferGeometry
        
        if (this.useTextures) {
            // Phase 2: Texture indices for sampling from texture array
            const textureIndices = new Float32Array(this.count)
            
            for (let i = 0; i < this.count; i++) {
                // Map instance to texture layer (cycle through available textures)
                const layerCount = this.textureArray?.image.depth || this.count
                textureIndices[i] = i % layerCount
                
                // Position matrix for this instance
                const matrix = new THREE.Matrix4()
                matrix.setPosition(
                    (i % 5) * 0.5 - 1.0,           // X: spread horizontally (5 columns)
                    Math.floor(i / 5) * 0.5 + 1.5, // Y: stack vertically (rows of 5)
                    -2                              // Z: in front of camera
                )
                this.instancedMesh.setMatrixAt(i, matrix)
            }
            
            // Add texture index attribute
            geometry.setAttribute('textureIndex', 
                new THREE.InstancedBufferAttribute(textureIndices, 1)
            )
            
            console.debug(`📊 [SimpleInstancedTest] Set up ${this.count} instances with texture indices`)
        } else {
            // Phase 1: Random colors
            const colors = new Float32Array(this.count * 3)
            
            for (let i = 0; i < this.count; i++) {
                // Random color per instance
                colors[i * 3 + 0] = Math.random() // R
                colors[i * 3 + 1] = Math.random() // G
                colors[i * 3 + 2] = Math.random() // B
                
                // Position matrix for this instance
                const matrix = new THREE.Matrix4()
                matrix.setPosition(
                    (i % 5) * 0.5 - 1.0,           // X: spread horizontally (5 columns)
                    Math.floor(i / 5) * 0.5 + 1.5, // Y: stack vertically (rows of 5)
                    -2                              // Z: in front of camera
                )
                this.instancedMesh.setMatrixAt(i, matrix)
            }
            
            // Add instance colors as attribute
            geometry.setAttribute('instanceColor', 
                new THREE.InstancedBufferAttribute(colors, 3)
            )
            
            console.debug(`📊 [SimpleInstancedTest] Set up ${this.count} instance transforms and colors`)
        }
        
        // Mark matrices as needing update
        this.instancedMesh.instanceMatrix.needsUpdate = true
    }

    private getVertexShader(): string {
        if (this.useTextures) {
            // Phase 2: Texture array sampling
            return `
                // Per-instance texture index (which layer to sample)
                attribute float textureIndex;
                
                // Pass to fragment shader
                varying float vTextureIndex;
                varying vec2 vUv;
                
                void main() {
                    vTextureIndex = textureIndex;
                    vUv = uv;
                    
                    // instanceMatrix is automatically provided by THREE.InstancedMesh
                    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
                }
            `
        } else {
            // Phase 1: Colored quads
            return `
                // Per-instance color attribute
                attribute vec3 instanceColor;
                
                // Pass to fragment shader
                varying vec3 vColor;
                varying vec2 vUv;
                
                void main() {
                    vColor = instanceColor;
                    vUv = uv;
                    
                    // instanceMatrix is automatically provided by THREE.InstancedMesh
                    // It transforms each instance to its unique position/rotation/scale
                    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
                }
            `
        }
    }

    private getFragmentShader(): string {
        if (this.useTextures) {
            // Phase 2: Sample from texture array
            return `
                #ifdef GL_ES
                precision highp sampler2DArray;
                #endif
                
                uniform sampler2DArray textureArray;
                varying float vTextureIndex;
                varying vec2 vUv;
                
                void main() {
                    // Sample from texture array at specific layer
                    vec4 texColor = texture(textureArray, vec3(vUv, vTextureIndex));
                    gl_FragColor = texColor;
                }
            `
        } else {
            // Phase 1: Simple colored quad
            return `
                varying vec3 vColor;
                varying vec2 vUv;
                
                void main() {
                    // Simple colored quad - color comes from instance attribute
                    gl_FragColor = vec4(vColor, 1.0);
                }
            `
        }
    }

    /**
     * Get stats for debugging
     */
    public getStats(): {
        instanceCount: number
        drawCalls: number // Should be 1
        triangles: number
    } {
        return {
            instanceCount: this.count,
            drawCalls: 1, // InstancedMesh renders all instances in 1 draw call
            triangles: this.count * 2 // Each quad is 2 triangles
        }
    }

    /**
     * Clean up resources
     */
    public dispose(): void {
        this.instancedMesh.geometry.dispose()
        
        // Handle material disposal (could be array or single material)
        const material = this.instancedMesh.material
        if (Array.isArray(material)) {
            material.forEach(m => m.dispose())
        } else {
            material.dispose()
        }
        
        this.scene.remove(this.instancedMesh)
        
        console.log('🗑️ [SimpleInstancedTest] Disposed')
    }
}
