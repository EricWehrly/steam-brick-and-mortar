/**
 * LOD Game Artwork Renderer - Clean separation of concerns
 * 
 * This renderer is responsible for:
 * - Holding the InstancedMesh and lit MeshStandardMaterial
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
import { AppSettings, Setting, type SettingChangedEvent } from '../../../core/AppSettings'
import { EventManager } from '../../../core/EventManager'
import { AppSettingsEventTypes } from '../../../types/InteractionEvents'
import { RenderLoopRegistry } from '../../RenderLoopRegistry'
import { SceneLayer } from '../../SceneLayers'
import { Logger } from '../../../utils/Logger'
import { HighTextureCache, type HighTextureCacheConfig } from './HighTextureCache'
import { SpatialPrewarmingManager, type PrewarmingConfig } from './SpatialPrewarmingManager'
import { PlacementRunResettableInstancedBase } from './PlacementRunResettableInstancedBase'
import type { RendererTextureSources } from './LodTypes'
import {
    applyLitArtworkTuning,
    createLitArtworkMaterial,
    isLitArtworkMaterialSettingKey,
} from './LitArtworkMaterial'

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

export type LodTextureArrays = RendererTextureSources

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
    highArtworkUrl?: string
    lodLevel?: LodLevel
    highTextureSlot?: number
    rotation?: THREE.Quaternion
}

/**
 * Clean renderer focused solely on GPU rendering.
 * Texture population is handled externally.
 */
export class LodGameArtworkRenderer extends PlacementRunResettableInstancedBase {
    public static logger = Logger.createLogFunctions(LodGameArtworkRenderer.name)
    private instancedMesh: THREE.InstancedMesh | null = null
    private geometry: THREE.BoxGeometry | null = null
    private material: THREE.MeshStandardMaterial | null = null
    
    // Texture arrays referenced by shader uniforms
    private textureArrays: { mode: 'lazy' | 'eager'; mid: THREE.DataArrayTexture; high: THREE.DataArrayTexture } | null = null
    
    // Per-instance GPU attributes
    private lodLevels: Float32Array | null = null
    private highTextureSlots: Float32Array | null = null
    private textureIndices: Float32Array | null = null
    
    // Instance tracking
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
    private readonly eventManager: EventManager
    private readonly appSettings: AppSettings
    private readonly appSettingsChangedHandler: (event: CustomEvent<SettingChangedEvent>) => void
    
    private readonly config: Required<Omit<LodGameArtworkRendererConfig, 'highTextureCacheConfig' | 'prewarmingConfig'>> & 
                             Pick<LodGameArtworkRendererConfig, 'highTextureCacheConfig' | 'prewarmingConfig'>
    
    private static readonly DEFAULT_ROTATION = new THREE.Quaternion()

    constructor(config: LodGameArtworkRendererConfig) {
        super(config.maxInstances)
        this.eventManager = EventManager.getInstance()
        this.appSettings = AppSettings.getInstance()
        this.appSettingsChangedHandler = this.onAppSettingsChanged.bind(this)
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
    public initialize(textureSources: LodTextureArrays, scene: THREE.Scene): void {
        if (this.instancedMesh) {
            LodGameArtworkRenderer.logger.warn('Already initialized')
            return
        }

        let highTexture: THREE.DataArrayTexture
        const midTexture = textureSources.mid

        const isExplicitLazy = 'mode' in textureSources && textureSources.mode === 'lazy'
        const isLegacyLazy = !('mode' in textureSources) && this.lazyHighTextures

        if (isExplicitLazy || isLegacyLazy) {
            const highConfig = this.config.highTextureCacheConfig ?? {}
            this.highTextureCache = new HighTextureCache({
                totalSlots: highConfig.totalSlots ?? 64,
                textureWidth: highConfig.textureWidth ?? 300,
                textureHeight: highConfig.textureHeight ?? 450,
                maxConcurrentLoads: highConfig.maxConcurrentLoads ?? 2,
                ...highConfig
            })
            this.highTextureCache.setSlotChangeCallback(this.onHighSlotChange.bind(this))
            highTexture = this.highTextureCache.getTexture()

            this.spatialPrewarming = new SpatialPrewarmingManager(
                this.highTextureCache,
                this.config.prewarmingConfig ?? {}
            )
        } else {
            const providedHighTexture = 'high' in textureSources ? textureSources.high : undefined
            if (!providedHighTexture) {
                throw new Error('Expected HIGH texture source in eager mode')
            }
            highTexture = providedHighTexture
        }

        this.textureArrays = { mode: isExplicitLazy || isLegacyLazy ? 'lazy' : 'eager', mid: midTexture, high: highTexture }


        this.material = createLitArtworkMaterial({ highTexture, midTexture })

        this.onAppSettingsChanged()

        this.eventManager.registerEventHandler<SettingChangedEvent>(
            AppSettingsEventTypes.Changed,
            this.appSettingsChangedHandler
        )
        
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
        
        this.invalidateInstancedMesh(this.instancedMesh)  // Force recompute; stale sphere breaks raycasting
        this.invalidateInstanceAttribute(this.geometry, 'textureIndex')
        this.invalidateInstanceAttribute(this.geometry, 'lodLevel')
        this.invalidateInstanceAttribute(this.geometry, 'highTextureSlot')
        
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
        highArtworkUrl,
        lodLevel = this.config.defaultLod,
        highTextureSlot = -1,
        rotation,
    }: AddInstanceParams): number {
        if (!this.instancedMesh || !this.geometry) {
            LodGameArtworkRenderer.logger.warn('Cannot add instance: renderer not initialized')
            return -1
        }
        
        const instanceIndex = this.allocateInstanceIndex()
        if (instanceIndex < 0) {
            LodGameArtworkRenderer.logger.warn(`Cannot add instance: at capacity (${this.maxInstances})`)
            return -1
        }
        
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
        if (this.lazyHighTextures && this.highTextureCache && highArtworkUrl) {
            this.highTextureCache.registerGame(textureIndex, gameName, highArtworkUrl)
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
        if (instanceIndex < 0 || instanceIndex >= this.getCurrentInstanceCount()) return false
        
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
        if (instanceIndex < 0 || instanceIndex >= this.getCurrentInstanceCount()) return false
        
        this.highTextureSlots[instanceIndex] = slot
        
        const data = this.instanceData.get(instanceIndex)
        if (data) data.highTextureSlot = slot
        
        this.pendingAttributeUpdate = true
        return true
    }
    
    public setGlobalLod(lodLevel: LodLevel): void {
        if (!this.lodLevels) return
        
        for (let i = 0; i < this.getCurrentInstanceCount(); i++) {
            this.lodLevels[i] = lodLevel
            const data = this.instanceData.get(i)
            if (data) data.lodLevel = lodLevel
        }
        
        this.pendingAttributeUpdate = true
        LodGameArtworkRenderer.logger.debug(`Set global LOD to ${lodLevel} for ${this.getCurrentInstanceCount()} instances`)
    }
    
    public getInstanceCount(): number {
        return this.getCurrentInstanceCount()
    }

    /**
     * Reset all instance positions without releasing texture slots.
     * Hides all boxes by moving them off-screen; texture data remains intact
     * so a subsequent placeInstance() call can reuse the same atlas entries.
     */
    public clearPlacements(): void {
        if (!this.instancedMesh) return
        const hidden = new THREE.Matrix4().setPosition(0, -10000, 0)
        for (let i = 0; i < this.getCurrentInstanceCount(); i++) {
            this.instancedMesh.setMatrixAt(i, hidden)
        }

        this.resetForPlacementRun()
        this.invalidateInstancedMesh(this.instancedMesh)
        this.pendingAttributeUpdate = true
        LodGameArtworkRenderer.logger.debug('Cleared all instance placements (texture slots retained)')
    }

    /**
     * Soft reset for a capacity-compatible library reload (see LodArtworkOrchestrator). Clears
     * placements like clearPlacements(), and additionally resets the HIGH texture cache — unlike
     * a placement-run reset (same games, same slots), a library reload reuses slot indices for
     * different games, and HighTextureCache.registerGame() no-ops on an already-registered slot.
     */
    public resetForLibraryReload(): void {
        this.clearPlacements()
        this.highTextureCache?.resetForLibraryReload()
    }

    protected override onPlacementRunReset(): void {
        this.instanceData.clear()
        this.textureIndexToInstance.clear()
    }

    public getInstanceLod(instanceIndex: number): LodLevel | null {
        return this.instanceData.get(instanceIndex)?.lodLevel ?? null
    }
    public isReady(): boolean {
        return this.instancedMesh !== null
    }
    
    public getHighTextureCache(): HighTextureCache | null {
        return this.highTextureCache
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

        this.eventManager.deregisterEventHandler<SettingChangedEvent>(
            AppSettingsEventTypes.Changed,
            this.appSettingsChangedHandler
        )
        
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

    private onAppSettingsChanged(event?: CustomEvent<SettingChangedEvent>): void {
        if (event && !isLitArtworkMaterialSettingKey(event.detail.settingName)) {
            return
        }
        if (!this.material) return

        applyLitArtworkTuning(this.material, {
            roughness: this.appSettings.getSetting(Setting.ArtworkRoughness),
            metalness: this.appSettings.getSetting(Setting.ArtworkMetalness),
            fresnelLift: this.appSettings.getSetting(Setting.ArtworkFresnelLift),
            fresnelPower: this.appSettings.getSetting(Setting.ArtworkFresnelPower),
        })
    }
}
