/**
 * Simple Instanced Test - Phase 1 POC
 * 
 * Proof of concept for GPU-side instanced rendering.
 * Renders multiple colored quads with a single draw call using THREE.InstancedMesh.
 * 
 * This is Phase 1 of the GPU instancing implementation plan:
 * - Goal: Verify instancing works with minimal complexity
 * - Expected: N instances = 1 draw call (vs N draw calls without instancing)
 * - Next: Phase 2 will add texture array sampling
 */

import * as THREE from 'three'

export class SimpleInstancedTest {
    private instancedMesh: THREE.InstancedMesh
    private scene: THREE.Scene
    private count: number

    constructor(scene: THREE.Scene, count: number = 10) {
        this.scene = scene
        this.count = count
        
        console.log(`🧪 [SimpleInstancedTest] Creating ${count} instanced quads`)
        
        // 1. Create geometry (one plane shared by all instances)
        const geometry = new THREE.PlaneGeometry(0.3, 0.4)
        
        // 2. Create shader material with instancing support
        const material = new THREE.ShaderMaterial({
            vertexShader: this.getVertexShader(),
            fragmentShader: this.getFragmentShader(),
            side: THREE.DoubleSide,
            transparent: true
        })
        
        // 3. Create instanced mesh
        this.instancedMesh = new THREE.InstancedMesh(geometry, material, count)
        this.instancedMesh.name = 'simple-instanced-test'
        
        // 4. Set up per-instance data
        this.setupInstanceData()
        
        // 5. Add to scene
        this.scene.add(this.instancedMesh)
        
        console.log(`✅ [SimpleInstancedTest] Created ${count} instances with 1 draw call`)
        console.log('🎨 [SimpleInstancedTest] Each quad should have a different random color')
    }

    private setupInstanceData(): void {
        // Create color attribute (RGB per instance)
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
        const geometry = this.instancedMesh.geometry as THREE.BufferGeometry
        geometry.setAttribute('instanceColor', 
            new THREE.InstancedBufferAttribute(colors, 3)
        )
        
        // Mark matrices as needing update
        this.instancedMesh.instanceMatrix.needsUpdate = true
        
        console.debug(`📊 [SimpleInstancedTest] Set up ${this.count} instance transforms and colors`)
    }

    private getVertexShader(): string {
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

    private getFragmentShader(): string {
        return `
            varying vec3 vColor;
            varying vec2 vUv;
            
            void main() {
                // Simple colored quad - color comes from instance attribute
                gl_FragColor = vec4(vColor, 1.0);
            }
        `
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
