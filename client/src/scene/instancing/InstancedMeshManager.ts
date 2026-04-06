import * as THREE from 'three'
import { DataManager } from '../../core/data/DataManager'
import { Logger } from '../../utils/Logger'
import type { InstancedMeshConfig, InstanceAttribute } from './IInstancedRenderer'

export class InstancedMeshManager {
    private static readonly logger = Logger.createLogFunctions(InstancedMeshManager.name)
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
    
    public initialize(config: InstancedMeshConfig): void {
        if (this.isInitialized) {
            InstancedMeshManager.logger.warn(`${this.debugName} already initialized`)
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
        InstancedMeshManager.logger.debug(`✅ ${this.debugName} initialized (max: ${this.maxInstances} instances)`)
    }
    
    public addInstanceAttributes(attributes: InstanceAttribute[]): void {
        if (!this.instancedMesh) {
            InstancedMeshManager.logger.error(`Cannot add attributes: ${this.debugName} not initialized`)
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
            
            InstancedMeshManager.logger.debug(`📊 Added instance attribute "${attr.name}" (${attr.itemSize} components) to ${this.debugName}`)
        }
    }
    
    public setInstanceMatrix(
        index: number,
        position: THREE.Vector3,
        rotation: THREE.Quaternion = InstancedMeshManager.DEFAULT_QUATERNION,
        scale: THREE.Vector3 = InstancedMeshManager.DEFAULT_SCALE
    ): boolean {
        if (!this.instancedMesh) {
            InstancedMeshManager.logger.warn(`Cannot set instance: ${this.debugName} not initialized`)
            return false
        }
        
        if (index >= this.maxInstances) {
            InstancedMeshManager.logger.warn(`Instance index ${index} exceeds max ${this.maxInstances} for ${this.debugName}`)
            return false
        }
        
        // Compose matrix from transform components
        InstancedMeshManager.TEMP_MATRIX.compose(position, rotation, scale)
        this.instancedMesh.setMatrixAt(index, InstancedMeshManager.TEMP_MATRIX)
        
        // Track highest index used
        this.currentCount = Math.max(this.currentCount, index + 1)
        
        return true
    }
    
    public setInstanceAttribute(
        attributeName: string,
        index: number,
        value: number | number[]
    ): boolean {
        if (!this.instancedMesh) {
            InstancedMeshManager.logger.warn(`Cannot set attribute: ${this.debugName} not initialized`)
            return false
        }
        
        const geometry = this.instancedMesh.geometry
        const attribute = geometry.getAttribute(attributeName) as THREE.InstancedBufferAttribute
        
        if (!attribute) {
            InstancedMeshManager.logger.warn(`Attribute "${attributeName}" not found on ${this.debugName}`)
            return false
        }
        
        if (index >= this.maxInstances) {
            InstancedMeshManager.logger.warn(`Instance index ${index} exceeds max ${this.maxInstances} for ${this.debugName}`)
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
    
    public setInstanceColor(index: number, color: THREE.Color): boolean {
        if (!this.instancedMesh) return false
        if (index >= this.maxInstances) return false
        // Ensure instanceColor buffer is allocated on first use
        if (!this.instancedMesh.instanceColor) {
            this.instancedMesh.setColorAt(index, color)
        } else {
            this.instancedMesh.setColorAt(index, color)
        }
        return true
    }

    public updateGPU(): void {
        if (!this.instancedMesh) {
            return
        }
        
        // Update instance matrices
        this.instancedMesh.instanceMatrix.needsUpdate = true
        if (this.instancedMesh.instanceColor) {
            this.instancedMesh.instanceColor.needsUpdate = true
        }
        
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
        
        InstancedMeshManager.logger.debug(`🔄 ${this.debugName} GPU updated: ${this.currentCount} active instances`)
    }
    
    public reset(): void {
        this.currentCount = 0
        if (this.instancedMesh) {
            this.instancedMesh.count = 0
        }
        InstancedMeshManager.logger.debug(`🔄 ${this.debugName} instances reset`)
    }
    
    public addToMainScene(): void {
        if (!this.instancedMesh) {
            InstancedMeshManager.logger.warn(`⚠️ Cannot add to scene: ${this.debugName} not initialized`)
            return
        }
        
        const scene = DataManager.getInstance().get<any>('core.mainScene')
        if (!scene) {
            InstancedMeshManager.logger.warn(`⚠️ Cannot add to scene: main scene not available in DataManager`)
            return
        }
        
        scene.add(this.instancedMesh)
        InstancedMeshManager.logger.debug(`➕ ${this.debugName} added to main scene`)
    }
    
    public removeFromMainScene(): void {
        if (!this.instancedMesh) {
            return
        }
        
        const scene = DataManager.getInstance().get<any>('core.mainScene')
        if (scene) {
            scene.remove(this.instancedMesh)
            InstancedMeshManager.logger.debug(`➖ ${this.debugName} removed from main scene`)
        }
    }
    
    // For advanced operations only
    public getInstancedMesh(): THREE.InstancedMesh | null {
        return this.instancedMesh
    }
    
    public isReady(): boolean {
        return this.isInitialized && this.instancedMesh !== null
    }
    
    public getStats() {
        return {
            isInitialized: this.isInitialized,
            activeInstances: this.currentCount,
            maxInstances: this.maxInstances,
            debugName: this.debugName
        }
    }
    
    public dispose(): void {
        InstancedMeshManager.logger.debug(`🧹 Disposing ${this.debugName}`)
        
        this.removeFromMainScene()
        
        // NOTE: Geometry and material are shared - caller handles disposal
        
        this.instancedMesh = null
        this.isInitialized = false
        this.currentCount = 0
        
        InstancedMeshManager.logger.debug(`✅ ${this.debugName} disposed`)
    }
}