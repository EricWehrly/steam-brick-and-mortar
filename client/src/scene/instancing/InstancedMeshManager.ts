/**
 * Instanced Mesh Manager - Shared Component for GPU Instancing
 * 
 * Handles common InstancedMesh operations across different renderer types:
 * - Mesh creation and initialization
 * - Instance matrix management
 * - GPU synchronization
 * - Scene integration
 * - Resource cleanup
 * 
 * Used by: InstancedLabelRenderer, InstancedArtworkRenderer, InstancedShelfRenderer
 */

import * as THREE from 'three'
import { DataManager } from '../../core/data/DataManager'
import type { InstancedMeshConfig, InstanceAttribute } from './IInstancedRenderer'

export class InstancedMeshManager {
    private instancedMesh: THREE.InstancedMesh | null = null
    private maxInstances: number
    private currentCount: number = 0
    private isInitialized: boolean = false
    private debugName: string
    
    // Reusable objects for performance
    private static readonly DEFAULT_QUATERNION = new THREE.Quaternion()
    private static readonly DEFAULT_SCALE = new THREE.Vector3(1, 1, 1)
    private static readonly TEMP_MATRIX = new THREE.Matrix4()
    
    constructor(debugName: string = 'InstancedMesh') {
        this.debugName = debugName
        this.maxInstances = 1000 // Default, overridden in initialize
    }
    
    /**
     * Initialize with geometry, material, and configuration
     */
    public initialize(config: InstancedMeshConfig): void {
        if (this.isInitialized) {
            console.warn(`${this.debugName} already initialized`)
            return
        }
        
        this.maxInstances = config.maxInstances
        
        // Create instanced mesh
        this.instancedMesh = new THREE.InstancedMesh(
            config.geometry,
            config.material,
            this.maxInstances
        )
        
        // Configure mesh properties
        this.instancedMesh.name = config.name || this.debugName
        this.instancedMesh.count = 0
        this.instancedMesh.castShadow = true
        this.instancedMesh.receiveShadow = true
        this.instancedMesh.visible = true
        this.instancedMesh.frustumCulled = false
        
        // Ensure mesh is positioned at world origin (instances handle their own positions)
        this.instancedMesh.position.set(0, 0, 0)
        this.instancedMesh.rotation.set(0, 0, 0)
        this.instancedMesh.scale.set(1, 1, 1)
        
        this.isInitialized = true
        console.debug(`✅ ${this.debugName} initialized (max: ${this.maxInstances} instances)`)
    }
    
    /**
     * Add custom instance attributes to the geometry
     */
    public addInstanceAttributes(attributes: InstanceAttribute[]): void {
        if (!this.instancedMesh) {
            throw new Error(`Cannot add attributes: ${this.debugName} not initialized`)
        }
        
        const geometry = this.instancedMesh.geometry
        
        for (const attr of attributes) {
            // Create buffer with appropriate size
            const buffer = new Float32Array(this.maxInstances * attr.itemSize)
            
            // Fill with default values if provided
            if (attr.defaultValue !== undefined) {
                const defaultValues = Array.isArray(attr.defaultValue) 
                    ? attr.defaultValue 
                    : [attr.defaultValue]
                
                for (let i = 0; i < this.maxInstances; i++) {
                    for (let j = 0; j < attr.itemSize; j++) {
                        buffer[i * attr.itemSize + j] = defaultValues[j] || defaultValues[0] || 0
                    }
                }
            }
            
            // Create and add attribute
            const bufferAttribute = new THREE.InstancedBufferAttribute(buffer, attr.itemSize)
            if (attr.usage) {
                bufferAttribute.setUsage(attr.usage)
            }
            
            geometry.setAttribute(attr.name, bufferAttribute)
            
            console.debug(`📊 Added instance attribute "${attr.name}" (${attr.itemSize} components) to ${this.debugName}`)
        }
    }
    
    /**
     * Set transform matrix for a specific instance
     */
    public setInstanceMatrix(
        index: number,
        position: THREE.Vector3,
        rotation: THREE.Quaternion = InstancedMeshManager.DEFAULT_QUATERNION,
        scale: THREE.Vector3 = InstancedMeshManager.DEFAULT_SCALE
    ): boolean {
        if (!this.instancedMesh) {
            console.warn(`Cannot set instance: ${this.debugName} not initialized`)
            return false
        }
        
        if (index >= this.maxInstances) {
            console.warn(`Instance index ${index} exceeds max ${this.maxInstances} for ${this.debugName}`)
            return false
        }
        
        // Compose matrix from transform components
        InstancedMeshManager.TEMP_MATRIX.compose(position, rotation, scale)
        this.instancedMesh.setMatrixAt(index, InstancedMeshManager.TEMP_MATRIX)
        
        // Track highest index used
        this.currentCount = Math.max(this.currentCount, index + 1)
        
        return true
    }
    
    /**
     * Set value for a custom instance attribute
     */
    public setInstanceAttribute(
        attributeName: string,
        index: number,
        value: number | number[]
    ): boolean {
        if (!this.instancedMesh) {
            console.warn(`Cannot set attribute: ${this.debugName} not initialized`)
            return false
        }
        
        const geometry = this.instancedMesh.geometry
        const attribute = geometry.getAttribute(attributeName) as THREE.InstancedBufferAttribute
        
        if (!attribute) {
            console.warn(`Attribute "${attributeName}" not found on ${this.debugName}`)
            return false
        }
        
        if (index >= this.maxInstances) {
            console.warn(`Instance index ${index} exceeds max ${this.maxInstances} for ${this.debugName}`)
            return false
        }
        
        // Set attribute values
        if (Array.isArray(value)) {
            for (let i = 0; i < value.length && i < attribute.itemSize; i++) {
                (attribute as any).setComponent(index, i, value[i])
            }
        } else {
            attribute.setX(index, value)
        }
        
        return true
    }
    
    /**
     * Apply all pending updates to GPU
     */
    public updateGPU(): void {
        if (!this.instancedMesh) {
            return
        }
        
        // Update instance matrices
        this.instancedMesh.instanceMatrix.needsUpdate = true
        
        // Update instance count
        this.instancedMesh.count = this.currentCount
        
        // Update all instance attributes
        const geometry = this.instancedMesh.geometry
        for (const attributeName in geometry.attributes) {
            const attribute = geometry.attributes[attributeName]
            if (attribute instanceof THREE.InstancedBufferAttribute) {
                attribute.needsUpdate = true
            }
        }
        
        console.debug(`🔄 ${this.debugName} GPU updated: ${this.currentCount} active instances`)
    }
    
    /**
     * Reset all instances
     */
    public reset(): void {
        this.currentCount = 0
        if (this.instancedMesh) {
            this.instancedMesh.count = 0
        }
        console.debug(`🔄 ${this.debugName} instances reset`)
    }
    
    /**
     * Add the instanced mesh to the main scene
     */
    public addToMainScene(): void {
        if (!this.instancedMesh) {
            console.warn(`⚠️ Cannot add to scene: ${this.debugName} not initialized`)
            return
        }
        
        const scene = DataManager.getInstance().get<any>('core.mainScene')
        if (!scene) {
            console.warn(`⚠️ Cannot add to scene: main scene not available in DataManager`)
            return
        }
        
        scene.add(this.instancedMesh)
        console.debug(`➕ ${this.debugName} added to main scene`)
    }
    
    /**
     * Remove the instanced mesh from the main scene
     */
    public removeFromMainScene(): void {
        if (!this.instancedMesh) {
            return
        }
        
        const scene = DataManager.getInstance().get<any>('core.mainScene')
        if (scene) {
            scene.remove(this.instancedMesh)
            console.debug(`➖ ${this.debugName} removed from main scene`)
        }
    }
    
    /**
     * Get the underlying InstancedMesh (for advanced operations)
     */
    public getInstancedMesh(): THREE.InstancedMesh | null {
        return this.instancedMesh
    }
    
    /**
     * Check if ready for use
     */
    public isReady(): boolean {
        return this.isInitialized && this.instancedMesh !== null
    }
    
    /**
     * Get current statistics
     */
    public getStats() {
        return {
            isInitialized: this.isInitialized,
            activeInstances: this.currentCount,
            maxInstances: this.maxInstances,
            debugName: this.debugName
        }
    }
    
    /**
     * Dispose of all resources
     */
    public dispose(): void {
        console.debug(`🧹 Disposing ${this.debugName}`)
        
        // Remove from scene
        this.removeFromMainScene()
        
        // Dispose geometry and material if they're owned by this manager
        // Note: In most cases, geometry and material are shared, so we don't dispose them here
        // The calling renderer should handle disposal of shared resources
        
        // Clear references
        this.instancedMesh = null
        this.isInitialized = false
        this.currentCount = 0
        
        console.debug(`✅ ${this.debugName} disposed`)
    }
}