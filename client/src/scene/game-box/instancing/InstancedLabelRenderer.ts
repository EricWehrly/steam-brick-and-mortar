/**
 * Instanced Label Renderer - Production GPU Instancing for Game Labels
 * 
 * Renders thousands of game box labels with minimal draw calls using:
 * - THREE.InstancedMesh for geometry batching
 * - THREE.DataArrayTexture for texture sampling
 * - Custom shaders for per-instance positioning and texture selection
 * 
 * Performance Impact:
 * - Before: N games = N draw calls for labels
 * - After: N games = 1-2 draw calls total
 * 
 * Usage:
 * 1. Create with maximum expected instances
 * 2. Initialize with game data to build texture array
 * 3. Set individual label positions/textures via setLabelInstance()
 * 4. Call updateGPU() to apply changes
 */

import * as THREE from 'three'
import { LabelTextureArrayManager } from './LabelTextureArrayManager'
import type { SteamGameData } from '../types/GameData'
import { EventManager } from '../../../core/EventManager'
import { GameEventTypes } from '../../../types/InteractionEvents'
import { DataManager } from '../../../core/data/DataManager'
import { DataKey, DataDomain } from '../../../core/data/DataTypes'
import { ShelfSide } from '../../props/SharedPropsUtils'
import vertexShader from './shaders/instanced-label.vert?raw'
import fragmentShader from './shaders/instanced-label.frag?raw'

export interface InstancedLabelConfig {
    maxInstances?: number
    textureSize?: number
    labelWidth?: number
    labelHeight?: number
}

// Exported constant for identifying the instanced mesh in the scene
export const INSTANCED_LABEL_MESH_NAME = 'gpu-instanced-game-boxes' as const

export class InstancedLabelRenderer {
    private instancedMesh: THREE.InstancedMesh | null = null
    private textureArrayManager: LabelTextureArrayManager
    private geometry: THREE.PlaneGeometry | null = null
    private material: THREE.ShaderMaterial | null = null
    
    // Configuration
    private readonly maxInstances: number
    
    // State tracking
    private currentCount: number = 0
    private isInitialized: boolean = false
    private gameNameToTextureIndex: Map<string, number> = new Map()
    
    // Constant quaternion for no rotation (performance optimization)
    private static readonly DEFAULT_ROTATION = new THREE.Quaternion() // Identity quaternion (0,0,0,1)
    
    constructor(config: InstancedLabelConfig = {}) {
        this.maxInstances = config.maxInstances || 2000
        
        this.textureArrayManager = new LabelTextureArrayManager(
            config.textureSize || 512,
            this.maxInstances // Pass max textures to match max instances
        )
        
        EventManager.getInstance().registerEventHandler(GameEventTypes.InstancedBatchComplete, this.updateGPU.bind(this))
        
        console.debug(`📋 InstancedLabelRenderer created (max: ${this.maxInstances} labels)`)
    }
    
    /**
     * Initialize renderer infrastructure (lazy initialization for progressive loading)
     * Creates instanced mesh and texture array without requiring game data upfront
     */
    public initialize(): void {
        if (this.isInitialized) {
            console.warn('InstancedLabelRenderer already initialized')
            return
        }
        
        try {
            // Create pre-allocated texture array for dynamic population
            const textureArray = this.textureArrayManager.initializeEmptyTextureArray()
            
            this.material = this.createLabelMaterial(textureArray)
            
            // TODO: get dimensions from config
            this.geometry = new THREE.BoxGeometry(0.3, 0.4, 0.1)
            this.instancedMesh = new THREE.InstancedMesh(
                this.geometry,
                this.material,
                this.maxInstances
            )
            
            // Name the mesh for debugging
            this.instancedMesh.name = INSTANCED_LABEL_MESH_NAME
            
            // CRITICAL: Set count to 0 initially (will update as instances are added)
            this.instancedMesh.count = 0
            
            // Enable shadows and visibility
            this.instancedMesh.castShadow = true
            this.instancedMesh.receiveShadow = true
            this.instancedMesh.visible = true
            
            // Disable frustum culling to prevent disappearing when close
            this.instancedMesh.frustumCulled = false
            
            // Ensure InstancedMesh is positioned at world origin
            this.instancedMesh.position.set(0, 0, 0)
            this.instancedMesh.rotation.set(0, 0, 0)
            this.instancedMesh.scale.set(1, 1, 1)
            
            this.setupInstanceAttributes()
            
            this.isInitialized = true
            
            this.addToMainScene()
            
            console.log('✅ InstancedLabelRenderer initialized (lazy mode)')
            
        } catch (error) {
            console.error('❌ Failed to initialize InstancedLabelRenderer:', error)
            throw error
        }
    }
    
    /**
     * Set position, rotation and texture for a specific label instance
     * Dynamically adds texture for game if not already in mapping (supports progressive loading)
     */
    public setLabelInstance(
        index: number,
        position: THREE.Vector3,
        gameName: string,
        side: ShelfSide = ShelfSide.Front
    ): boolean {
        // Lazy initialization - initialize on first use to avoid blocking startup
        if (!this.isInitialized) {
            this.initialize()
        }
        
        if (!this.instancedMesh || !this.geometry) {
            console.warn('InstancedLabelRenderer failed to initialize')
            return false
        }
        
        if (index >= this.maxInstances) {
            console.warn(`Instance index ${index} exceeds max ${this.maxInstances}`)
            return false
        }
        
        // Get texture index for this game, or dynamically add if not present
        let textureIndex = this.gameNameToTextureIndex.get(gameName)
        if (textureIndex === undefined) {
            try {
                // Dynamically add texture for this game (supports progressive loading)
                textureIndex = this.textureArrayManager.addTextLabel(gameName)
                this.gameNameToTextureIndex.set(gameName, textureIndex)
            } catch (error) {
                console.warn(`Failed to add texture for game: ${gameName}`, error)
                return false
            }
        }
        
        // Update matrix for this instance (position + rotation based on side)
        const rotation = side === ShelfSide.Back 
            ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI) // 180° Y rotation for back side
            : InstancedLabelRenderer.DEFAULT_ROTATION // No rotation for front side
            
        const matrix = new THREE.Matrix4()
        matrix.compose(position, rotation, new THREE.Vector3(1, 1, 1))
        this.instancedMesh.setMatrixAt(index, matrix)
        
        // Update texture index attribute
        const textureIndices = this.geometry.getAttribute('textureIndex') as THREE.InstancedBufferAttribute
        textureIndices.setX(index, textureIndex)
        
        this.currentCount = Math.max(this.currentCount, index + 1)
        
        this.storeLabelMetadata(index, gameName, position)
        
        return true
    }
    
    private storeLabelMetadata(index: number, gameName: string, position: THREE.Vector3): void {
        const dataManager = DataManager.getInstance()
        let metadata = dataManager.get<Map<number, { name: string; position: THREE.Vector3 }>>(DataKey.InstancedLabelMetadata)
        
        if (!metadata) {
            metadata = new Map()
            dataManager.set(DataKey.InstancedLabelMetadata, metadata, {
                domain: DataDomain.Renderer
            })
        }
        
        metadata.set(index, { name: gameName, position: position.clone() })
    }
    
    /**
     * Apply all instance updates to GPU
     * Call this after setting multiple instances for efficiency
     */
    public updateGPU(): void {
        if (!this.isInitialized || !this.instancedMesh || !this.geometry) {
            return
        }
        
        // Batch update: mark texture array dirty (uploads to GPU)
        this.textureArrayManager.markDirty()
        
        this.instancedMesh.instanceMatrix.needsUpdate = true
        
        this.instancedMesh.count = this.currentCount
        
        const textureIndices = this.geometry.getAttribute('textureIndex')
        if (textureIndices) {
            textureIndices.needsUpdate = true
        }
        
        console.debug(`🔄 GPU updated: ${this.currentCount} active label instances`)
    }
    
    /**
     * Reset all instances (clears positions and count)
     */
    public reset(): void {
        this.currentCount = 0
        if (this.instancedMesh) {
            this.instancedMesh.count = 0
        }
    }
    
    /**
     * Get current statistics
     */
    public getStats(): {
        isInitialized: boolean
        activeInstances: number
        maxInstances: number
        textureArrayStats: any
    } {
        return {
            isInitialized: this.isInitialized,
            activeInstances: this.currentCount,
            maxInstances: this.maxInstances,
            textureArrayStats: this.textureArrayManager.getStats()
        }
    }

    /**
     * Create shader material for instanced labels with texture array support
     */
    private createLabelMaterial(textureArray: THREE.DataArrayTexture): THREE.ShaderMaterial {
        return new THREE.ShaderMaterial({
            uniforms: {
                textureArray: { value: textureArray }
            },
            vertexShader,
            fragmentShader,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,  // Avoid depth fighting with game boxes
            depthTest: true
        })
    }
    
    /**
     * Set up per-instance buffer attributes
     */
    private setupInstanceAttributes(): void {
        if (!this.geometry) return
        
        // Texture indices (which layer of texture array each instance uses)
        const textureIndices = new Float32Array(this.maxInstances)
        // Initialize with -1 to indicate unused instances
        textureIndices.fill(-1)
        
        this.geometry.setAttribute('textureIndex',
            new THREE.InstancedBufferAttribute(textureIndices, 1)
        )
    }
    
    public isReady(): boolean {
        return this.isInitialized && this.instancedMesh !== null
    }
    
    private addToMainScene(): void {
        if (!this.instancedMesh) {
            console.warn('⚠️ Cannot add to scene: instancedMesh not initialized')
            return
        }
        
        const scene = DataManager.getInstance().get<any>('core.mainScene')
        if (!scene) {
            console.warn('⚠️ Cannot add to scene: main scene not available in DataManager')
            return
        }
        
        scene.add(this.instancedMesh)
    }
    
    public dispose(): void {
        console.debug('🧹 Disposing InstancedLabelRenderer')
        
        if (this.instancedMesh) {
            const scene = DataManager.getInstance().get<any>('core.mainScene')
            if (scene) {
                scene.remove(this.instancedMesh)
            }
            this.instancedMesh = null
        }
        
        // Dispose geometry and material
        this.geometry?.dispose()
        this.material?.dispose()
        
        // Dispose texture array manager
        this.textureArrayManager.dispose()
        
        // Clear state
        this.gameNameToTextureIndex.clear()
        this.isInitialized = false
        this.currentCount = 0
        
        console.debug('✅ InstancedLabelRenderer disposed')
    }
}