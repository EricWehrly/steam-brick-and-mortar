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
 * 3. Add label instances via addLabelInstance()
 * 4. Call updateGPU() to apply changes
 */

import * as THREE from 'three'
import { LabelTextureArrayManager } from './LabelTextureArrayManager'
import { EventManager } from '../../../core/EventManager'
import {
    GameEventTypes,
    type SomeBatchesCompleteEvent,
} from '../../../types/InteractionEvents'
import { DataManager } from '../../../core/data/DataManager'
import { DataKey, DataDomain } from '../../../core/data/DataTypes'
import { SceneLayer } from '../../SceneLayers'
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
    private maxInstances: number
    private readonly textureSize: number
    
    // State tracking
    private currentCount: number = 0
    private isInitialized: boolean = false
    private nextInstanceIndex: number = 0
    private gameNameToTextureIndex: Map<string, number> = new Map()

    // Deferred allocation: buffer label requests until all batches are known,
    // then allocate the texture array at exactly the right size.
    private deferLabels: boolean = true
    private pendingLabels: Array<{ gameName: string; appid?: number; position: THREE.Vector3; side: ShelfSide; rotation?: THREE.Quaternion }> = []
    private static readonly DEFERRED_OVERFLOW = 32  // Extra slots for late-arriving failures
    
    // Constant quaternion for no rotation (performance optimization)
    private static readonly DEFAULT_ROTATION = new THREE.Quaternion() // Identity quaternion (0,0,0,1)
    
    constructor(config: InstancedLabelConfig = {}) {
        this.maxInstances = config.maxInstances || 2000
        this.textureSize = config.textureSize || 128
        
        // Placeholder manager — will be replaced with right-sized instance in materializeLabels()
        this.textureArrayManager = new LabelTextureArrayManager(
            this.textureSize,
            this.maxInstances
        )

        EventManager.getInstance().registerEventHandler(
            GameEventTypes.SomeBatchesComplete,
            this.handleSomeBatchesComplete.bind(this)
        )
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.AllBatchesComplete,
            () => this.materializeLabels()
        )

        // Register a fresh metadata map immediately so stale data from a previous
        // renderer instance is cleared (dispose() also clears it, but construction
        // must be self-sufficient in case dispose() wasn't called cleanly).
        DataManager.getInstance().set(
            DataKey.InstancedLabelMetadata,
            new Map<number, { name: string; appid?: number; position: THREE.Vector3 }>(),
            { domain: DataDomain.Renderer }
        )

        console.debug(`📋 InstancedLabelRenderer created (max: ${this.maxInstances} labels)`)
    }

    /**
     * Materialize all deferred labels at exact size.
     * Call once after all game batches are known (on AllBatchesComplete).
     * Allocates the texture array and InstancedMesh sized to actual label count
     * rather than the max-games estimate, saving ~900 MB+ for a typical library.
     */
    public materializeLabels(): void {
        if (this.isInitialized) return
        if (this.pendingLabels.length === 0) return

        const count = this.pendingLabels.length + InstancedLabelRenderer.DEFERRED_OVERFLOW
        this.maxInstances = count
        this.textureArrayManager = new LabelTextureArrayManager(this.textureSize, count)

        this.deferLabels = false
        this.initialize()

        for (const { gameName, appid, position, side, rotation } of this.pendingLabels) {
            this.addLabelInstance(position, gameName, appid, side, rotation)
        }
        this.pendingLabels = []

        this.updateGPU()
        console.log(`✅ Labels materialized: ${this.currentCount} labels, ${this.textureSize}×${this.textureSize}×${count} = ${(this.textureSize * this.textureSize * count * 4 / (1024 * 1024)).toFixed(1)} MB`)
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
            this.instancedMesh.layers.enable(SceneLayer.Interactable)
            
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
     * Add a label instance using renderer-managed indexing.
     */
    public addLabelInstance(
        position: THREE.Vector3,
        gameName: string,
        appid?: number,
        side: ShelfSide = ShelfSide.Front,
        rotation?: THREE.Quaternion
    ): boolean {
        // Deferred path: buffer until materializeLabels() is called
        if (this.deferLabels) {
            this.pendingLabels.push({ gameName, appid, position: position.clone(), side, rotation })
            return true
        }

        // Lazy initialization - initialize on first use to avoid blocking startup
        if (!this.isInitialized) {
            this.initialize()
        }
        
        if (!this.instancedMesh || !this.geometry) {
            console.warn('InstancedLabelRenderer failed to initialize')
            return false
        }
        
        if (this.nextInstanceIndex >= this.maxInstances) {
            console.warn(`No label slots remaining (${this.maxInstances})`)
            return false
        }

        const index = this.nextInstanceIndex++
        
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
        
        // Use caller-supplied rotation (from GameBoxUtils.calculateGameRotation).
        // Front=rotY+PI, Back=rotY. The rotation ensures the correct face (-Z for Front,
        // +Z for Back) faces the player. DoubleSide material renders both faces, so the
        // pre-mirrored canvas texture reads correctly on whichever face the player sees.
        const effectiveRotation = rotation ?? (
            side === ShelfSide.Front
                ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)
                : InstancedLabelRenderer.DEFAULT_ROTATION
        )

const matrix = new THREE.Matrix4()
        matrix.compose(position, effectiveRotation, new THREE.Vector3(1, 1, 1))
        this.instancedMesh.setMatrixAt(index, matrix)
        
        // Update texture index attribute
        const textureIndices = this.geometry.getAttribute('textureIndex') as THREE.InstancedBufferAttribute
        textureIndices.setX(index, textureIndex)
        
        this.currentCount = Math.max(this.currentCount, index + 1)
        
        this.storeLabelMetadata(index, gameName, position, appid)
        
        return true
    }
    
    private storeLabelMetadata(index: number, gameName: string, position: THREE.Vector3, appid?: number): void {
        const dataManager = DataManager.getInstance()
        let metadata = dataManager.get<Map<number, { name: string; appid?: number; position: THREE.Vector3 }>>(DataKey.InstancedLabelMetadata)
        
        if (!metadata) {
            metadata = new Map()
            dataManager.set(DataKey.InstancedLabelMetadata, metadata, {
                domain: DataDomain.Renderer
            })
        }
        
        metadata.set(index, { name: gameName, appid, position: position.clone() })
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
        this.instancedMesh.boundingSphere = null  // Force recompute; stale sphere breaks raycasting
        
        const textureIndices = this.geometry.getAttribute('textureIndex')
        if (textureIndices) {
            textureIndices.needsUpdate = true
        }
        
        console.debug(`🔄 GPU updated: ${this.currentCount} active label instances`)
    }

    private handleSomeBatchesComplete(_event: CustomEvent<SomeBatchesCompleteEvent>): void {
        this.updateGPU()
    }
    
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
        this.nextInstanceIndex = 0

        // Clear metadata map — this renderer owns it, so clean it up.
        // Without this, a new InstancedLabelRenderer would inherit stale instanceId
        // entries from the previous load, causing wrong-game-on-click after reload.
        DataManager.getInstance().set(
            DataKey.InstancedLabelMetadata,
            new Map<number, { name: string; position: THREE.Vector3 }>(),
            { domain: DataDomain.Renderer }
        )
        
        console.debug('✅ InstancedLabelRenderer disposed')
    }
}