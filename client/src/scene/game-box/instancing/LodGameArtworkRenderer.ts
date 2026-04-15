/**
 * LOD Game Artwork Renderer - Clean separation of concerns
 * 
 * This renderer is responsible for:
 * - Holding the InstancedMesh and ShaderMaterial
 * - Updating GPU state each frame
 * - Managing per-instance LOD levels
 * - HIGH texture cache (LRU for memory optimization)
 * - Spatial pre-warming (proactive loading based on player movement)
 * 
 * It does NOT:
 * - Load textures from URLs (handled by GameArtworkProvider)
 * - Know anything about Steam APIs
 * 
 * Texture arrays are passed in via constructor, populated upstream.
 */

import * as THREE from 'three'
import { RenderLoopRegistry } from '../../RenderLoopRegistry'
import { SceneLayer } from '../../SceneLayers'
import { Logger } from '../../../utils/Logger'
import { HighTextureCache, type HighTextureCacheConfig } from './HighTextureCache'
import { SpatialPrewarmingManager, type PrewarmingConfig } from './SpatialPrewarmingManager'
import vertexShader from './shaders/instanced-artwork-lod.vert?raw'
import fragmentShader from './shaders/instanced-artwork-lod.frag?raw'

// Class-scoped logger will be attached to the class

/** Mesh name used by the LOD artwork InstancedMesh — used by GameFinder for raycast identity checks. */
export const LOD_ARTWORK_MESH_NAME = 'lod-game-artwork' as const

/** LOD level constants */
export const LOD_LEVEL = {
    HIGH: 0,
    MID: 1
} as const

export type LodLevel = typeof LOD_LEVEL[keyof typeof LOD_LEVEL]

/** Configuration for the renderer */
export interface LodGameArtworkRendererConfig {
    /** Maximum number of instances */
    maxInstances: number
    /** Box dimensions for each instance */
    boxWidth: number
    boxHeight: number
    boxDepth: number
    /** Default LOD level for new instances */
    defaultLod?: LodLevel
    /** How often to flush pending updates to GPU (in frames) */
    gpuUpdateInterval?: number
    /** Enable lazy HIGH texture loading (memory optimization) */
    lazyHighTextures?: boolean
    /** HIGH texture cache config (only used with lazyHighTextures) */
    highTextureCacheConfig?: Partial<HighTextureCacheConfig>
    /** Spatial pre-warming config (only used with lazyHighTextures) */
    prewarmingConfig?: Partial<PrewarmingConfig>
}

/** Texture arrays for each LOD level, passed in from upstream */
export interface LodTextureArrays {
    high: THREE.DataArrayTexture
    mid: THREE.DataArrayTexture
}

/** Per-instance data for external tracking */
export interface InstanceData {
    instanceIndex: number
    textureIndex: number
    gameName: string
    position: THREE.Vector3
    lodLevel: LodLevel
    highTextureSlot: number  // -1 if HIGH not loaded
}

/** Parameters for addInstance() - extracted per PR review. */
export interface AddInstanceParams {
    position: THREE.Vector3
    textureIndex: number
    gameName: string
    artworkUrl?: string
    lodLevel?: LodLevel
    highTextureSlot?: number
    rotation?: THREE.Quaternion
}

/**
 * Clean renderer focused solely on GPU rendering.
 * Texture population is handled externally.
 */
export class LodGameArtworkRenderer {
    public static logger = Logger.createLogFunctions(LodGameArtworkRenderer.name)
    private instancedMesh: THREE.InstancedMesh | null = null
    private geometry: THREE.BoxGeometry | null = null
    private material: THREE.ShaderMaterial | null = null
    
    // Texture arrays (owned externally, referenced here)
    private textureArrays: LodTextureArrays | null = null
    
    // Per-instance GPU attributes
    private lodLevels: Float32Array | null = null
    private highTextureSlots: Float32Array | null = null
    private textureIndices: Float32Array | null = null
    
    // Instance tracking
    private currentInstanceCount: number = 0
    private instanceData: Map<number, InstanceData> = new Map()
    private textureIndexToInstance: Map<number, number> = new Map()
    
    // GPU update throttling
    private gpuUpdateFrameCounter: number = 0
    private readonly gpuUpdateInterval: number
    private pendingAttributeUpdate: boolean = false
    
    // HIGH texture lazy loading (memory optimization)
    private readonly lazyHighTextures: boolean
    private highTextureCache: HighTextureCache | null = null
    private spatialPrewarming: SpatialPrewarmingManager | null = null
    private pendingHighPromotion: Map<number, number> = new Map()  // textureIndex → highSlot
    
    // Render loop registration
    private isRegisteredForRenderLoop: boolean = false
    
    private readonly config: Required<Omit<LodGameArtworkRendererConfig, 'highTextureCacheConfig' | 'prewarmingConfig'>> & 
                             Pick<LodGameArtworkRendererConfig, 'highTextureCacheConfig' | 'prewarmingConfig'>
    
    private static readonly DEFAULT_ROTATION = new THREE.Quaternion()

    constructor(config: LodGameArtworkRendererConfig) {
        this.lazyHighTextures = config.lazyHighTextures ?? false
        this.config = {
            maxInstances: config.maxInstances,
            boxWidth: config.boxWidth,
            boxHeight: config.boxHeight,
            boxDepth: config.boxDepth,
            // With lazy loading, default to MID since HIGH may not be loaded yet
            defaultLod: this.lazyHighTextures ? LOD_LEVEL.MID : (config.defaultLod ?? LOD_LEVEL.HIGH),
            gpuUpdateInterval: config.gpuUpdateInterval ?? 10,
            lazyHighTextures: this.lazyHighTextures,
            highTextureCacheConfig: config.highTextureCacheConfig,
            prewarmingConfig: config.prewarmingConfig
        }
        this.gpuUpdateInterval = this.config.gpuUpdateInterval
        
        LodGameArtworkRenderer.logger.lifecycle(`Created with maxInstances=${this.config.maxInstances}, defaultLod=${this.config.defaultLod}, lazyHigh=${this.lazyHighTextures}`)
    }
    
    /**
     * Initialize the renderer with texture arrays.
     * Must be called before adding instances.
     */
    public initialize(textureArrays: LodTextureArrays, scene: THREE.Scene): void {
        if (this.instancedMesh) {
            LodGameArtworkRenderer.logger.warn('Already initialized')
            return
        }
        
        this.textureArrays = textureArrays
        
        // Initialize HIGH texture cache if lazy loading enabled
        if (this.lazyHighTextures) {
            const highConfig = this.config.highTextureCacheConfig ?? {}
            this.highTextureCache = new HighTextureCache({
                totalSlots: highConfig.totalSlots ?? 64,
                textureWidth: highConfig.textureWidth ?? 300,
                textureHeight: highConfig.textureHeight ?? 450,
                maxConcurrentLoads: highConfig.maxConcurrentLoads ?? 2,
                ...highConfig
            })
            this.highTextureCache.setSlotChangeCallback(this.onHighSlotChange.bind(this))
            this.highTextureCache.setTextureArray(textureArrays.high)
            
            // Initialize spatial pre-warming
            this.spatialPrewarming = new SpatialPrewarmingManager(
                this.highTextureCache,
                this.config.prewarmingConfig ?? {}
            )
        }
        
        // Create material referencing the texture arrays
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                textureArrayHigh: { value: textureArrays.high },
                textureArrayMid: { value: textureArrays.mid }
            },
            vertexShader,
            fragmentShader,
            transparent: true,
            side: THREE.FrontSide
        })
        
        // Create geometry
        this.geometry = new THREE.BoxGeometry(
            this.config.boxWidth,
            this.config.boxHeight,
            this.config.boxDepth
        )
        
        // Create instanced mesh
        this.instancedMesh = new THREE.InstancedMesh(
            this.geometry,
            this.material,
            this.config.maxInstances
        )
        this.instancedMesh.name = LOD_ARTWORK_MESH_NAME
        this.instancedMesh.layers.enable(SceneLayer.Interactable)
        this.instancedMesh.count = 0
        this.instancedMesh.castShadow = true
        this.instancedMesh.receiveShadow = true
        this.instancedMesh.frustumCulled = false
        
        // Setup per-instance attributes
        this.textureIndices = new Float32Array(this.config.maxInstances)
        this.lodLevels = new Float32Array(this.config.maxInstances)
        this.highTextureSlots = new Float32Array(this.config.maxInstances)
        
        this.textureIndices.fill(0)
        this.lodLevels.fill(this.config.defaultLod)
        this.highTextureSlots.fill(-1)
        
        const textureIndexAttr = new THREE.InstancedBufferAttribute(this.textureIndices, 1)
        const lodLevelAttr = new THREE.InstancedBufferAttribute(this.lodLevels, 1)
        const highTextureSlotAttr = new THREE.InstancedBufferAttribute(this.highTextureSlots, 1)
        
        textureIndexAttr.setUsage(THREE.DynamicDrawUsage)
        lodLevelAttr.setUsage(THREE.DynamicDrawUsage)
        highTextureSlotAttr.setUsage(THREE.DynamicDrawUsage)
        
        this.geometry.setAttribute('textureIndex', textureIndexAttr)
        this.geometry.setAttribute('lodLevel', lodLevelAttr)
        this.geometry.setAttribute('highTextureSlot', highTextureSlotAttr)
        
        // Add to scene
        scene.add(this.instancedMesh)
        
        // Register for render loop
        if (!this.isRegisteredForRenderLoop) {
            RenderLoopRegistry.getInstance().register(
                'LodGameArtworkRenderer',
                this.onFrame.bind(this)
            )
            this.isRegisteredForRenderLoop = true
        }
        
        LodGameArtworkRenderer.logger.lifecycle('Initialized and added to scene')
    }
    
    /**
     * Called every frame by the render loop.
     * Handles periodic GPU updates.
     */
    private onFrame(_now: number, _deltaTime: number): void {
        this.gpuUpdateFrameCounter++
        
        if (this.gpuUpdateFrameCounter >= this.gpuUpdateInterval) {
            this.gpuUpdateFrameCounter = 0
            
            // Flush HIGH texture cache to GPU if dirty
            const didFlush = this.highTextureCache?.flushToGpu() ?? false
            
            // After GPU flush, promote pending games to HIGH LOD
            if (didFlush || this.pendingHighPromotion.size > 0) {
                this.promotePendingHighTextures()
            }
            
            this.flushToGpu()
        }
    }
    
    private promotePendingHighTextures(): void {
        if (this.pendingHighPromotion.size === 0 || !this.lodLevels) return
        
        let promotedCount = 0
        for (const [textureIndex, _slot] of this.pendingHighPromotion) {
            const instanceIndex = this.textureIndexToInstance.get(textureIndex)
            if (instanceIndex === undefined) continue
            
            this.lodLevels[instanceIndex] = LOD_LEVEL.HIGH
            
            const data = this.instanceData.get(instanceIndex)
            if (data) data.lodLevel = LOD_LEVEL.HIGH
            
            promotedCount++
        }
        
        if (promotedCount > 0) {
            this.pendingAttributeUpdate = true
            LodGameArtworkRenderer.logger.runtime(`Promoted ${promotedCount} games to HIGH LOD (after GPU flush)`)
        }
        
        this.pendingHighPromotion.clear()
    }
    
    private onHighSlotChange(textureIndex: number, slot: number): void {
        if (!this.highTextureSlots) return
        
        const instanceIndex = this.textureIndexToInstance.get(textureIndex)
        if (instanceIndex === undefined) {
            LodGameArtworkRenderer.logger.runtime(`HIGH slot change for unknown textureIndex ${textureIndex}`)
            return
        }
        
        // Update slot attribute
        this.highTextureSlots[instanceIndex] = slot
        
        const data = this.instanceData.get(instanceIndex)
        if (data) data.highTextureSlot = slot
        
        if (slot >= 0) {
            // Queue for HIGH promotion AFTER GPU flush (prevents texture flash)
            this.pendingHighPromotion.set(textureIndex, slot)
        } else {
            // Eviction: immediately downgrade to MID
            this.pendingHighPromotion.delete(textureIndex)
            if (this.lodLevels) {
                this.lodLevels[instanceIndex] = LOD_LEVEL.MID
            }
            if (data) data.lodLevel = LOD_LEVEL.MID
        }
        
        this.pendingAttributeUpdate = true
    }
    
    /**
     * Flush any pending updates to the GPU.
     * Called periodically from onFrame and can be called manually.
     */
    public flushToGpu(): void {
        if (!this.instancedMesh || !this.geometry) return
        if (!this.pendingAttributeUpdate) return
        
        this.instancedMesh.instanceMatrix.needsUpdate = true
        this.instancedMesh.count = this.currentInstanceCount
        this.instancedMesh.boundingSphere = null  // Force recompute; stale sphere breaks raycasting
        
        const textureIndexAttr = this.geometry.getAttribute('textureIndex')
        const lodLevelAttr = this.geometry.getAttribute('lodLevel')
        const highSlotAttr = this.geometry.getAttribute('highTextureSlot')
        
        if (textureIndexAttr) textureIndexAttr.needsUpdate = true
        if (lodLevelAttr) lodLevelAttr.needsUpdate = true
        if (highSlotAttr) highSlotAttr.needsUpdate = true
        
        this.pendingAttributeUpdate = false
    }
    
    /**
     * Add a new instance at the given position.
     * Returns the instance index, or -1 if at capacity.
     */
    public addInstance({
        position,
        textureIndex,
        gameName,
        artworkUrl,
        lodLevel = this.config.defaultLod,
        highTextureSlot = -1,
        rotation,
    }: AddInstanceParams): number {
        if (!this.instancedMesh || !this.geometry) {
            LodGameArtworkRenderer.logger.warn('Cannot add instance: renderer not initialized')
            return -1
        }
        
        if (this.currentInstanceCount >= this.config.maxInstances) {
            LodGameArtworkRenderer.logger.warn(`Cannot add instance: at capacity (${this.config.maxInstances})`)
            return -1
        }
        
        const instanceIndex = this.currentInstanceCount++
        
        // Set transform
        const matrix = new THREE.Matrix4()
        matrix.compose(position, rotation ?? LodGameArtworkRenderer.DEFAULT_ROTATION, new THREE.Vector3(1, 1, 1))
        this.instancedMesh.setMatrixAt(instanceIndex, matrix)
        
        // Set attributes
        this.textureIndices![instanceIndex] = textureIndex
        this.lodLevels![instanceIndex] = lodLevel
        this.highTextureSlots![instanceIndex] = highTextureSlot
        
        // Track instance data
        this.instanceData.set(instanceIndex, {
            instanceIndex,
            textureIndex,
            gameName,
            position: position.clone(),
            lodLevel,
            highTextureSlot
        })
        this.textureIndexToInstance.set(textureIndex, instanceIndex)
        
        // Register with HIGH texture cache if lazy loading
        if (this.lazyHighTextures && this.highTextureCache && artworkUrl) {
            this.highTextureCache.registerGame(textureIndex, gameName, artworkUrl)
        }
        
        // Register position for spatial prewarming
        this.spatialPrewarming?.registerGamePosition(textureIndex, gameName, position)
        
        this.pendingAttributeUpdate = true
        return instanceIndex
    }
    
    /**
     * Update the LOD level for a specific instance.
     */
    public setInstanceLod(instanceIndex: number, lodLevel: LodLevel): boolean {
        if (!this.geometry || !this.lodLevels) return false
        if (instanceIndex < 0 || instanceIndex >= this.currentInstanceCount) return false
        
        let effectiveLod = lodLevel
        
        // If lazy HIGH textures enabled and requesting HIGH, check availability
        if (this.lazyHighTextures && lodLevel === LOD_LEVEL.HIGH && this.highTextureCache) {
            const textureIndex = this.textureIndices![instanceIndex]
            
            // Check if texture is pending GPU flush
            if (this.pendingHighPromotion.has(textureIndex)) {
                effectiveLod = LOD_LEVEL.MID
            } else {
                const highSlot = this.highTextureCache.requestHighTexture(textureIndex)
                if (highSlot < 0) {
                    // HIGH not ready - stay at MID, will be promoted via onHighSlotChange
                    effectiveLod = LOD_LEVEL.MID
                }
            }
        }
        
        this.lodLevels[instanceIndex] = effectiveLod
        
        const data = this.instanceData.get(instanceIndex)
        if (data) data.lodLevel = effectiveLod
        
        this.pendingAttributeUpdate = true
        return effectiveLod === lodLevel
    }
    
    /**
     * Update the HIGH texture slot for a specific instance.
     */
    public setInstanceHighSlot(instanceIndex: number, slot: number): boolean {
        if (!this.geometry || !this.highTextureSlots) return false
        if (instanceIndex < 0 || instanceIndex >= this.currentInstanceCount) return false
        
        this.highTextureSlots[instanceIndex] = slot
        
        const data = this.instanceData.get(instanceIndex)
        if (data) data.highTextureSlot = slot
        
        this.pendingAttributeUpdate = true
        return true
    }
    
    /**
     * Set LOD level for all instances.
     */
    public setGlobalLod(lodLevel: LodLevel): void {
        if (!this.lodLevels) return
        
        for (let i = 0; i < this.currentInstanceCount; i++) {
            this.lodLevels[i] = lodLevel
            const data = this.instanceData.get(i)
            if (data) data.lodLevel = lodLevel
        }
        
        this.pendingAttributeUpdate = true
        LodGameArtworkRenderer.logger.debug(`Set global LOD to ${lodLevel} for ${this.currentInstanceCount} instances`)
    }
    
    /**
     * Get instance data for a specific instance.
     */
    public getInstance(instanceIndex: number): InstanceData | undefined {
        return this.instanceData.get(instanceIndex)
    }
    
    /**
     * Get all instance data (readonly).
     */
    public getAllInstances(): ReadonlyMap<number, InstanceData> {
        return this.instanceData
    }
    
    public getInstanceCount(): number {
        return this.currentInstanceCount
    }
    
    public getMaxInstances(): number {
        return this.config.maxInstances
    }
    
    public isReady(): boolean {
        return this.instancedMesh !== null
    }
    
    public getMesh(): THREE.InstancedMesh | null {
        return this.instancedMesh
    }
    
    public getHighTextureCache(): HighTextureCache | null {
        return this.highTextureCache
    }
    
    public startPrewarming(): void {
        this.spatialPrewarming?.start()
    }
    
    public stopPrewarming(): void {
        this.spatialPrewarming?.stop()
    }

    /**
     * Evict all loaded HIGH textures, downgrading all instances to MID LOD.
     * Called after extended focus loss to release GPU memory.
     * HIGH textures will reload from pixel cache on next player approach.
     */
    public spinDownHighTextures(): void {
        if (!this.highTextureCache || !this.lodLevels) return
        const evicted = this.highTextureCache.evictAll()
        if (evicted === 0) return
        // Eviction fires onHighSlotChange for each game, which already sets lodLevel to MID.
        // Force a GPU flush so the shader sees the slot reset before the next render.
        this.pendingAttributeUpdate = true
        LodGameArtworkRenderer.logger.info(`spinDownHighTextures: evicted ${evicted} HIGH textures, all instances downgraded to MID`)
    }
    
    public isHighTextureLoaded(instanceIndex: number): boolean {
        if (!this.lazyHighTextures || !this.highTextureCache) {
            return true  // Not using lazy loading
        }
        const textureIndex = this.textureIndices?.[instanceIndex]
        if (textureIndex === undefined) return false
        return this.highTextureCache.isLoaded(textureIndex)
    }
    
    public dispose(): void {
        if (this.isRegisteredForRenderLoop) {
            RenderLoopRegistry.getInstance().unregister('LodGameArtworkRenderer')
            this.isRegisteredForRenderLoop = false
        }
        
        this.instancedMesh?.removeFromParent()
        this.geometry?.dispose()
        this.material?.dispose()
        
        // Dispose HIGH texture management
        this.spatialPrewarming?.dispose()
        this.highTextureCache?.dispose()
        
        // Note: We don't dispose texture arrays - they're owned externally
        
        this.instanceData.clear()
        this.textureIndexToInstance.clear()
        this.pendingHighPromotion.clear()
        this.textureIndices = null
        this.lodLevels = null
        this.highTextureSlots = null
        
        LodGameArtworkRenderer.logger.lifecycle('Disposed')
    }
}
