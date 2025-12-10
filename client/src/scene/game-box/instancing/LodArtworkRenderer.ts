/**
 * LOD Artwork Renderer - GPU Instancing with Per-Instance Level of Detail
 * 
 * Allows dynamic LOD switching per game box instance.
 * Maintains 3 texture arrays at different resolutions:
 * 
 * | LOD Level | Resolution | Purpose               | VRAM (512 layers) |
 * |-----------|------------|----------------------|-------------------|
 * | High (0)  | 512×512    | Full detail          | 512 MB            |
 * | Mid (1)   | 128×128    | Reasonable quality   | 32 MB             |
 * | Low (2)   | 16×16      | Distant/overview     | 0.5 MB            |
 * 
 * Key feature: Per-instance LOD attribute allows mixing LOD levels in same draw call.
 * All three texture arrays share the same texture indices - a game at index 5
 * has its high-res version at textureArrayHigh[5], mid at textureArrayMid[5], etc.
 */

import * as THREE from 'three'
import { DataManager } from '../../../core/data/DataManager'
import { DataKey, DataDomain } from '../../../core/data/DataTypes'
import type { InstanceMetadata } from '../../../debug/GameFinder'
import { EventManager } from '../../../core/EventManager'
import { GameEventTypes } from '../../../types/InteractionEvents'
import { RenderLoopRegistry } from '../../RenderLoopRegistry'
import vertexShader from './shaders/instanced-artwork-lod.vert?raw'
import fragmentShader from './shaders/instanced-artwork-lod.frag?raw'
import { TextureWorker } from './TextureWorker'
import { HighTextureCache, HighTextureState } from './HighTextureCache'
import { SpatialPrewarmingManager, type PrewarmingConfig } from './SpatialPrewarmingManager'
import { Logger } from '../../../utils/Logger'

const log = Logger.withContext('LodArtworkRenderer')

/** Steam library capsule (portrait) native dimensions - like physical game boxes */
/** 
 * Steam library capsule dimensions
 * Note: While Steam advertises 600×900, their CDN often serves 300×450 (exactly half)
 * We use the actual served dimensions to enable native-size loading without resize
 */
export const STEAM_CAPSULE_WIDTH = 300
export const STEAM_CAPSULE_HEIGHT = 450

/** Game box dimensions matching Steam library capsule aspect ratio (300:450 = 2:3) */
export const DEFAULT_BOX_WIDTH = 0.2   // Width in meters
export const DEFAULT_BOX_HEIGHT = 0.3  // Height matches 2:3 aspect ratio (portrait)

/** LOD level constants - Only HIGH and MID, no LOW */
export const LOD_LEVEL = {
    HIGH: 0,
    MID: 1
} as const

export type LodLevel = typeof LOD_LEVEL[keyof typeof LOD_LEVEL]

/** LOD configuration */
export interface LodConfig {
    level: LodLevel
    /** For square textures (MID tier) */
    textureSize?: number
    /** For non-square textures (HIGH tier - native Steam headers) */
    textureWidth?: number
    textureHeight?: number
    name: string
    /** Max texture array depth for this LOD (defaults to maxTextures if not set) */
    maxDepth?: number
}

/** 
 * Default LOD configurations - Two-tier system
 * HIGH: Native resolution (600x900) portrait capsules - dynamically loaded/evicted for nearby games
 * MID: Square thumbnails (128x128) - covers all games at reasonable quality
 */
export const DEFAULT_LOD_CONFIGS: LodConfig[] = [
    { level: LOD_LEVEL.HIGH, textureWidth: STEAM_CAPSULE_WIDTH, textureHeight: STEAM_CAPSULE_HEIGHT, name: 'high', maxDepth: 128 },
    { level: LOD_LEVEL.MID, textureSize: 128, name: 'mid' }  // Uses maxTextures for full coverage
]

export interface LodArtworkConfig {
    /** Maximum number of textures/instances */
    maxTextures?: number
    /** Override LOD configurations */
    lodConfigs?: LodConfig[]
    /** Box dimensions */
    boxWidth?: number
    boxHeight?: number
    boxDepth?: number
    /** Default LOD level for new instances */
    defaultLod?: LodLevel
    /** Enable lazy HIGH texture loading (memory optimization) */
    lazyHighTextures?: boolean
    /** Max HIGH textures to cache when lazy loading */
    maxHighTextureCache?: number
    /** Spatial pre-warming configuration (only used with lazyHighTextures) */
    prewarmingConfig?: Partial<PrewarmingConfig>
}

interface LodTextureState {
    config: LodConfig
    dataArrayTexture: THREE.DataArrayTexture | null
    pendingUpdates: Set<number>  // Texture indices that need GPU update
    /** Actual depth of this texture array (may differ from maxTextures) */
    arrayDepth: number
}

export class LodArtworkRenderer {
    private instancedMesh: THREE.InstancedMesh | null = null
    private geometry: THREE.BoxGeometry | null = null
    private material: THREE.ShaderMaterial | null = null
    
    // One texture array per LOD level
    private lodTextures: Map<LodLevel, LodTextureState> = new Map()
    
    // Shared texture index tracking (same index across all LOD levels)
    private textureSlots: Map<string, number> = new Map()  // gameName -> textureIndex
    private textureIndexToInstance: Map<number, number> = new Map()  // textureIndex -> instanceIndex
    private failedArtwork: Map<string, { reason: string; url: string; timestamp: number }> = new Map()
    private nextTextureIndex: number = 0
    private currentInstanceCount: number = 0
    
    // Per-instance data
    private instanceMetadata: Map<number, InstanceMetadata & { lodLevel: LodLevel }> = new Map()
    private lodLevels: Float32Array | null = null
    private highTextureSlots: Float32Array | null = null  // Maps instanceIndex -> slot in HIGH array (-1 if not loaded)
    
    private textureWorker: TextureWorker
    private readonly maxTextures: number
    private readonly dimensions: { width: number; height: number; depth: number }
    private readonly defaultLod: LodLevel
    private readonly lodConfigs: LodConfig[]
    
    // Lazy HIGH texture loading (memory optimization)
    private readonly lazyHighTextures: boolean
    private highTextureCache: HighTextureCache | null = null
    private spatialPrewarming: SpatialPrewarmingManager | null = null
    private readonly prewarmingConfig: Partial<PrewarmingConfig>
    
    // Track artwork URLs for lazy loading
    private artworkUrls: Map<number, string> = new Map()  // textureIndex -> url
    
    // GPU update throttling
    private gpuUpdateFrameCounter: number = 0
    private readonly gpuUpdateInterval: number = 10  // Flush to GPU every N frames
    private isRegisteredForRenderLoop: boolean = false
    
    // Games waiting for GPU flush before LOD promotion to HIGH
    // This prevents the "flash" where LOD switches to HIGH before texture data is on GPU
    private pendingHighPromotion: Map<number, number> = new Map()  // textureIndex → highSlot
    
    private static readonly DEFAULT_ROTATION = new THREE.Quaternion()

    constructor(config: LodArtworkConfig = {}) {
        this.maxTextures = config.maxTextures ?? 512
        this.dimensions = {
            width: config.boxWidth ?? DEFAULT_BOX_WIDTH,
            height: config.boxHeight ?? DEFAULT_BOX_HEIGHT,
            depth: config.boxDepth ?? 0.1
        }
        // With lazy loading, default to MID since HIGH may not be loaded yet
        this.lazyHighTextures = config.lazyHighTextures ?? false
        this.defaultLod = this.lazyHighTextures ? LOD_LEVEL.MID : (config.defaultLod ?? LOD_LEVEL.HIGH)
        this.lodConfigs = config.lodConfigs ?? DEFAULT_LOD_CONFIGS
        this.prewarmingConfig = config.prewarmingConfig ?? {}
        
        this.textureWorker = new TextureWorker()
        
        // Initialize lazy HIGH texture cache if enabled
        if (this.lazyHighTextures) {
            const highConfig = this.lodConfigs.find(c => c.level === LOD_LEVEL.HIGH)
            // HIGH array depth determines how many slots we have for dynamic loading
            const highArrayDepth = highConfig?.maxDepth ?? this.maxTextures
            this.highTextureCache = new HighTextureCache({
                totalSlots: highArrayDepth,
                textureWidth: highConfig?.textureWidth ?? STEAM_CAPSULE_WIDTH,
                textureHeight: highConfig?.textureHeight ?? STEAM_CAPSULE_HEIGHT,
                maxConcurrentLoads: 2
            })
            
            // Set callback so cache can notify us when slot assignments change
            this.highTextureCache.setSlotChangeCallback(this.onHighSlotChange.bind(this))
            
            // Initialize spatial pre-warming manager
            this.spatialPrewarming = new SpatialPrewarmingManager(
                this.highTextureCache,
                this.prewarmingConfig
            )
        }
        
        // Initialize LOD texture states with per-LOD array depths
        for (const lodConfig of this.lodConfigs) {
            // Use config's maxDepth if set, otherwise fall back to maxTextures
            const arrayDepth = lodConfig.maxDepth ?? this.maxTextures
            this.lodTextures.set(lodConfig.level, {
                config: lodConfig,
                dataArrayTexture: null,
                pendingUpdates: new Set(),
                arrayDepth
            })
        }
        
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.InstancedBatchComplete, 
            this.updateGPU.bind(this)
        )
        
        this.logConfig()
    }
    
    private logConfig(): void {
        let totalVRAM = 0
        const lodInfo: string[] = []
        
        for (const [_level, state] of this.lodTextures) {
            const depth = state.arrayDepth
            const width = state.config.textureWidth ?? state.config.textureSize ?? 128
            const height = state.config.textureHeight ?? state.config.textureSize ?? 128
            const vram = width * height * depth * 4
            totalVRAM += vram
            lodInfo.push(`${state.config.name}: ${depth} slots × ${width}×${height}px = ${(vram / (1024 * 1024)).toFixed(1)}MB`)
        }
        
        log.lifecycle(`LOD VRAM: ${lodInfo.join(', ')} | Total: ${(totalVRAM / (1024 * 1024)).toFixed(0)}MB`)
    }
    
    /**
     * Initialize GPU resources (called lazily on first game)
     */
    private initialize(): void {
        if (this.instancedMesh) return
        
        // Create all LOD texture arrays with per-LOD depths
        for (const [_level, state] of this.lodTextures) {
            // Support both square (textureSize) and non-square (textureWidth/Height) configs
            const width = state.config.textureWidth ?? state.config.textureSize ?? 128
            const height = state.config.textureHeight ?? state.config.textureSize ?? 128
            const depth = state.arrayDepth
            const data = new Uint8Array(width * height * depth * 4)
            state.dataArrayTexture = new THREE.DataArrayTexture(data, width, height, depth)
            state.dataArrayTexture.format = THREE.RGBAFormat
            state.dataArrayTexture.type = THREE.UnsignedByteType
            state.dataArrayTexture.minFilter = THREE.LinearFilter
            state.dataArrayTexture.magFilter = THREE.LinearFilter
            state.dataArrayTexture.wrapS = THREE.ClampToEdgeWrapping
            state.dataArrayTexture.wrapT = THREE.ClampToEdgeWrapping
            state.dataArrayTexture.needsUpdate = true
            
            log.debug(`Created ${state.config.name} LOD texture array: ${width}×${height}×${depth}`)
        }
        
        // Give HIGH texture array reference to cache if lazy loading
        if (this.lazyHighTextures && this.highTextureCache) {
            const highState = this.lodTextures.get(LOD_LEVEL.HIGH)
            if (highState?.dataArrayTexture) {
                this.highTextureCache.setTextureArray(highState.dataArrayTexture)
            }
        }
        
        // Create material with HIGH and MID texture arrays (no LOW)
        const highState = this.lodTextures.get(LOD_LEVEL.HIGH)
        const midState = this.lodTextures.get(LOD_LEVEL.MID)
        
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                textureArrayHigh: { value: highState?.dataArrayTexture },
                textureArrayMid: { value: midState?.dataArrayTexture }
            },
            vertexShader,
            fragmentShader,
            transparent: true,
            side: THREE.FrontSide
        })
        
        // Create geometry
        this.geometry = new THREE.BoxGeometry(
            this.dimensions.width,
            this.dimensions.height,
            this.dimensions.depth
        )
        
        // Create instanced mesh
        this.instancedMesh = new THREE.InstancedMesh(
            this.geometry,
            this.material,
            this.maxTextures
        )
        this.instancedMesh.name = 'gpu-artwork-lod'
        this.instancedMesh.count = 0
        this.instancedMesh.castShadow = true
        this.instancedMesh.receiveShadow = true
        this.instancedMesh.frustumCulled = false
        
        // Setup per-instance attributes
        const textureIndices = new Float32Array(this.maxTextures)
        this.lodLevels = new Float32Array(this.maxTextures)
        this.highTextureSlots = new Float32Array(this.maxTextures)
        textureIndices.fill(0)
        this.lodLevels.fill(this.defaultLod)
        this.highTextureSlots.fill(-1)  // -1 means "not loaded in HIGH array"
        
        const textureIndexAttr = new THREE.InstancedBufferAttribute(textureIndices, 1)
        const lodLevelAttr = new THREE.InstancedBufferAttribute(this.lodLevels, 1)
        const highTextureSlotAttr = new THREE.InstancedBufferAttribute(this.highTextureSlots, 1)
        textureIndexAttr.setUsage(THREE.DynamicDrawUsage)
        lodLevelAttr.setUsage(THREE.DynamicDrawUsage)
        highTextureSlotAttr.setUsage(THREE.DynamicDrawUsage)
        
        this.geometry.setAttribute('textureIndex', textureIndexAttr)
        this.geometry.setAttribute('lodLevel', lodLevelAttr)
        this.geometry.setAttribute('highTextureSlot', highTextureSlotAttr)
        
        // Add to scene
        const scene = DataManager.getInstance().get<THREE.Scene>(DataKey.MainScene)
        if (scene) {
            scene.add(this.instancedMesh)
            log.lifecycle('Initialized and added to scene')
        }
        
        // Register for render loop to handle periodic GPU updates
        if (!this.isRegisteredForRenderLoop) {
            RenderLoopRegistry.getInstance().register(
                'LodArtworkRenderer',
                this.onFrame.bind(this)
            )
            this.isRegisteredForRenderLoop = true
        }
        
        // Register metadata with DataManager
        DataManager.getInstance().set(
            'artworkMetadata_lod' as DataKey,
            this.instanceMetadata,
            { domain: DataDomain.Scene }
        )
    }
    
    /**
     * Add artwork instance by URL
     * With lazyHighTextures: loads MID/LOW immediately, HIGH on-demand
     * Without: loads all LOD levels immediately
     */
    public async setArtworkInstanceFromUrl(
        position: THREE.Vector3,
        gameName: string,
        artworkUrl: string,
        appid?: number
    ): Promise<{ success: boolean; instanceIndex: number }> {
        // Lazy initialize
        if (!this.instancedMesh) {
            this.initialize()
        }
        
        // Check if artwork previously failed (CORS, 404, etc) - don't retry
        if (this.failedArtwork.has(gameName)) {
            const failure = this.failedArtwork.get(gameName)
            log.debug(`Skipping "${gameName}": previously failed (${failure?.reason})`)
            return { success: false, instanceIndex: -1 }
        }
        
        // Check capacity
        if (this.nextTextureIndex >= this.maxTextures) {
            log.warn(`Atlas full (${this.maxTextures} textures)`)
            return { success: false, instanceIndex: -1 }
        }
        
        // Check for existing texture
        const existingIndex = this.textureSlots.get(gameName)
        if (existingIndex !== undefined) {
            return { success: true, instanceIndex: existingIndex }
        }
        
        const textureIndex = this.nextTextureIndex++
        
        // Store URL for lazy HIGH texture loading
        this.artworkUrls.set(textureIndex, artworkUrl)
        
        try {
            // Process LOD levels SEQUENTIALLY - the worker shares a canvas
            // and concurrent requests with different sizes cause data corruption
            for (const [level, state] of this.lodTextures) {
                // Skip HIGH texture if lazy loading is enabled - will be loaded on demand
                // NOTE: We register with HighTextureCache AFTER MID succeeds to avoid
                // registering games whose artwork is inaccessible (CORS, 404, etc)
                if (this.lazyHighTextures && level === LOD_LEVEL.HIGH) {
                    continue
                }
                
                // Get texture dimensions (support both square and non-square)
                const width = state.config.textureWidth ?? state.config.textureSize ?? 128
                const height = state.config.textureHeight ?? state.config.textureSize ?? 128
                
                const result = await this.textureWorker.fetchAndProcess(
                    artworkUrl,
                    width,  // Use width as textureSize for MID (square)
                    textureIndex,
                    gameName,
                    10000
                )
                
                // Copy to texture array
                if (!state.dataArrayTexture) {
                    throw new Error(`${state.config.name} texture array not initialized`)
                }
                const sliceSize = width * height * 4
                const offset = textureIndex * sliceSize
                const arrayData = state.dataArrayTexture.image.data as Uint8Array
                
                // Verify image data size matches expected
                if (result.imageData.length !== sliceSize) {
                    log.error(`Size mismatch for "${gameName}" LOD ${level}: expected ${sliceSize}, got ${result.imageData.length}`)
                }
                
                arrayData.set(result.imageData, offset)
                state.pendingUpdates.add(textureIndex)
            }
            
            // MID loading succeeded - now register with HighTextureCache for lazy HIGH loading
            // This is done AFTER MID succeeds to avoid registering games with inaccessible artwork
            if (this.lazyHighTextures) {
                this.highTextureCache?.registerGame(textureIndex, gameName, artworkUrl)
            }
            
            this.textureSlots.set(gameName, textureIndex)
            
            // Add instance
            const instanceIndex = this.currentInstanceCount++
            
            // Track the reverse mapping: textureIndex -> instanceIndex
            this.textureIndexToInstance.set(textureIndex, instanceIndex)
            
            const matrix = new THREE.Matrix4()
            matrix.compose(position, LodArtworkRenderer.DEFAULT_ROTATION, new THREE.Vector3(1, 1, 1))
            this.instancedMesh!.setMatrixAt(instanceIndex, matrix)
            
            // Set attributes
            const textureIndices = this.geometry!.getAttribute('textureIndex') as THREE.InstancedBufferAttribute
            textureIndices.setX(instanceIndex, textureIndex)
            
            const lodLevelAttr = this.geometry!.getAttribute('lodLevel') as THREE.InstancedBufferAttribute
            lodLevelAttr.setX(instanceIndex, this.defaultLod)
            
            // Store metadata
            this.instanceMetadata.set(instanceIndex, {
                name: gameName,
                appid,
                position: position.clone(),
                lodLevel: this.defaultLod
            })
            
            // Register with spatial prewarming for proactive HIGH texture loading
            this.spatialPrewarming?.registerGamePosition(textureIndex, gameName, position)
            
            // Update GPU immediately - the instance is ready to render
            // This is needed because InstancedBatchComplete fires before async texture loads complete
            this.updateGPU()
            
            return { success: true, instanceIndex }
            
        } catch (error) {
            // Rollback texture index on failure
            this.nextTextureIndex--
            this.artworkUrls.delete(textureIndex)
            
            const msg = error instanceof Error ? error.message : String(error)
            
            // Track this game as failed with categorized reason
            const reason = this.categorizeFailure(msg)
            this.failedArtwork.set(gameName, { reason, url: artworkUrl, timestamp: Date.now() })
            log.debug(`Artwork failed for "${gameName}": ${reason} (${msg})`)
            return { success: false, instanceIndex: -1 }
        }
    }
    
    /**
     * Categorize failure reason from error message for better diagnostics
     */
    private categorizeFailure(errorMsg: string): string {
        const lowerMsg = errorMsg.toLowerCase()
        if (lowerMsg.includes('cors') || lowerMsg.includes('networkerror')) {
            return 'CORS'
        }
        if (lowerMsg.includes('404') || lowerMsg.includes('not found')) {
            return '404'
        }
        if (lowerMsg.includes('timeout') || lowerMsg.includes('abort')) {
            return 'TIMEOUT'
        }
        if (lowerMsg.includes('invalid content')) {
            return 'INVALID_CONTENT'
        }
        return 'UNKNOWN'
    }
    
    /**
     * Set LOD level for a specific instance
     * With lazyHighTextures: if HIGH is requested but not loaded, triggers async load
     * and keeps instance at MID until HIGH is ready AND flushed to GPU
     */
    public setInstanceLod(instanceIndex: number, lodLevel: LodLevel): boolean {
        if (!this.geometry || instanceIndex < 0 || instanceIndex >= this.currentInstanceCount) {
            log.warn(`setInstanceLod failed: invalid index ${instanceIndex} (count: ${this.currentInstanceCount})`)
            return false
        }
        
        const metadata = this.instanceMetadata.get(instanceIndex)
        
        // If lazy HIGH textures enabled and requesting HIGH, check if texture is loaded AND flushed
        let effectiveLod = lodLevel
        if (this.lazyHighTextures && lodLevel === LOD_LEVEL.HIGH && this.highTextureCache) {
            const textureIndexAttr = this.geometry.getAttribute('textureIndex') as THREE.InstancedBufferAttribute
            const textureIndex = Math.floor(textureIndexAttr.getX(instanceIndex))
            
            // Check if texture is pending GPU flush (queued for promotion)
            if (this.pendingHighPromotion.has(textureIndex)) {
                // Texture loaded but not yet flushed to GPU - stay at MID
                effectiveLod = LOD_LEVEL.MID
            } else {
                // Request HIGH texture - returns slot (0-63) if loaded, -1 if not
                const highSlot = this.highTextureCache.requestHighTexture(textureIndex)
                
                if (highSlot < 0) {
                    // HIGH texture not ready yet - stay at MID for now
                    // onHighSlotChange callback will queue for promotion when texture loads
                    effectiveLod = LOD_LEVEL.MID
                }
            }
        }
        
        const lodLevelAttr = this.geometry.getAttribute('lodLevel') as THREE.InstancedBufferAttribute
        lodLevelAttr.setX(instanceIndex, effectiveLod)
        lodLevelAttr.needsUpdate = true
        
        // Update metadata
        if (metadata) {
            metadata.lodLevel = effectiveLod
        }
        
        return effectiveLod === lodLevel  // Return false if we had to downgrade
    }
    
    /**
     * Set LOD level for ALL instances at once
     */
    public setGlobalLod(lodLevel: LodLevel): void {
        if (!this.geometry || !this.lodLevels) return
        
        const lodLevelAttr = this.geometry.getAttribute('lodLevel') as THREE.InstancedBufferAttribute
        
        for (let i = 0; i < this.currentInstanceCount; i++) {
            lodLevelAttr.setX(i, lodLevel)
            
            const metadata = this.instanceMetadata.get(i)
            if (metadata) {
                metadata.lodLevel = lodLevel
            }
        }
        
        lodLevelAttr.needsUpdate = true
        log.debug(`Set global LOD to ${lodLevel} for ${this.currentInstanceCount} instances`)
    }
    
    /**
     * Get current LOD level for an instance
     */
    public getInstanceLod(instanceIndex: number): LodLevel | null {
        const metadata = this.instanceMetadata.get(instanceIndex)
        return metadata?.lodLevel ?? null
    }
    
    /**
     * Callback from HighTextureCache when a game's slot assignment changes
     * Updates the highTextureSlot attribute but DEFERS LOD promotion until after GPU flush
     * This prevents the "flash" where shader renders HIGH before texture data is uploaded
     */
    private onHighSlotChange(gameIndex: number, slot: number): void {
        if (!this.geometry || !this.highTextureSlots) return
        
        // gameIndex from HighTextureCache is actually textureIndex
        const instanceIndex = this.textureIndexToInstance.get(gameIndex)
        if (instanceIndex === undefined) {
            log.runtime(`HIGH slot change for unknown textureIndex ${gameIndex} - no instance mapping found`)
            return
        }
        
        if (instanceIndex >= 0 && instanceIndex < this.highTextureSlots.length) {
            // Update slot attribute immediately (shader will still use MID until LOD changes)
            this.highTextureSlots[instanceIndex] = slot
            
            const highSlotAttr = this.geometry.getAttribute('highTextureSlot') as THREE.InstancedBufferAttribute
            if (highSlotAttr) {
                highSlotAttr.setX(instanceIndex, slot)
                highSlotAttr.needsUpdate = true
            }
            
            if (slot >= 0) {
                // Queue for HIGH promotion AFTER GPU flush (prevents flash)
                this.pendingHighPromotion.set(gameIndex, slot)
            } else {
                // Eviction: immediately downgrade to MID
                this.pendingHighPromotion.delete(gameIndex)
                const lodLevelAttr = this.geometry.getAttribute('lodLevel') as THREE.InstancedBufferAttribute
                if (lodLevelAttr && this.lodLevels) {
                    this.lodLevels[instanceIndex] = LOD_LEVEL.MID
                    lodLevelAttr.setX(instanceIndex, LOD_LEVEL.MID)
                    lodLevelAttr.needsUpdate = true
                }
                const metadata = this.instanceMetadata.get(instanceIndex)
                if (metadata) metadata.lodLevel = LOD_LEVEL.MID
            }
        }
    }
    
    /**
     * Promote pending games to HIGH LOD after GPU flush
     * Called after flushToGpu() to ensure texture data is on GPU before shader reads it
     */
    private promotePendingHighTextures(): void {
        if (this.pendingHighPromotion.size === 0 || !this.geometry || !this.lodLevels) return
        
        const lodLevelAttr = this.geometry.getAttribute('lodLevel') as THREE.InstancedBufferAttribute
        if (!lodLevelAttr) return
        
        let promotedCount = 0
        for (const [textureIndex, _slot] of this.pendingHighPromotion) {
            const instanceIndex = this.textureIndexToInstance.get(textureIndex)
            if (instanceIndex === undefined) continue
            
            this.lodLevels[instanceIndex] = LOD_LEVEL.HIGH
            lodLevelAttr.setX(instanceIndex, LOD_LEVEL.HIGH)
            
            const metadata = this.instanceMetadata.get(instanceIndex)
            if (metadata) metadata.lodLevel = LOD_LEVEL.HIGH
            
            promotedCount++
        }
        
        if (promotedCount > 0) {
            lodLevelAttr.needsUpdate = true
            log.runtime(`Promoted ${promotedCount} games to HIGH LOD (after GPU flush)`)
        }
        
        this.pendingHighPromotion.clear()
    }

    /**
     * Render loop callback - handles periodic GPU updates
     * Throttles needsUpdate to every N frames to batch multiple texture loads
     */
    private onFrame(_now: number, _deltaTime: number): void {
        this.gpuUpdateFrameCounter++
        
        // Only flush to GPU every N frames (batches texture uploads)
        if (this.gpuUpdateFrameCounter >= this.gpuUpdateInterval) {
            this.gpuUpdateFrameCounter = 0
            
            // Flush HIGH texture cache to GPU if dirty
            const didFlush = this.highTextureCache?.flushToGpu() ?? false
            
            // AFTER GPU flush, promote pending games to HIGH LOD
            // This ensures texture data is on GPU before shader tries to read it
            if (didFlush || this.pendingHighPromotion.size > 0) {
                this.promotePendingHighTextures()
            }
        }
    }

    /**
     * Update GPU resources
     * Called periodically from render loop - batches texture updates
     */
    public updateGPU(): void {
        if (!this.instancedMesh || !this.geometry) return
        
        // Update all LOD texture arrays (MID textures) using PARTIAL layer updates
        // Instead of uploading entire array, only upload changed layers
        for (const state of this.lodTextures.values()) {
            if (state.dataArrayTexture && state.pendingUpdates.size > 0) {
                // Mark only changed layers for upload (massive GPU bandwidth savings)
                for (const textureIndex of state.pendingUpdates) {
                    state.dataArrayTexture.addLayerUpdate(textureIndex)
                }
                state.dataArrayTexture.needsUpdate = true
                state.pendingUpdates.clear()
            }
        }
        
        // Flush HIGH texture cache if dirty (batches multiple texture loads)
        if (this.highTextureCache) {
            this.highTextureCache.flushToGpu()
        }
        
        this.instancedMesh.instanceMatrix.needsUpdate = true
        this.instancedMesh.count = this.currentInstanceCount
        
        const textureIndices = this.geometry.getAttribute('textureIndex')
        if (textureIndices) {
            textureIndices.needsUpdate = true
        }
        
        const lodLevelAttr = this.geometry.getAttribute('lodLevel')
        if (lodLevelAttr) {
            lodLevelAttr.needsUpdate = true
        }
    }
    
    /**
     * Get memory usage stats
     */
    public getMemoryStats(): {
        lods: Record<string, { allocated: number; textureSize: number; arrayDepth: number }>
        totalAllocated: number
        textureCount: number
        instanceCount: number
        failedArtworkCount: number
        failedArtwork: Map<string, { reason: string; url: string; timestamp: number }>
    } {
        const lods: Record<string, { allocated: number; textureSize: number; arrayDepth: number }> = {}
        let totalAllocated = 0
        
        for (const [_level, state] of this.lodTextures) {
            const size = state.config.textureSize
            const depth = state.arrayDepth
            const allocated = state.dataArrayTexture 
                ? size * size * depth * 4  // Use actual array depth, not maxTextures
                : 0
            
            lods[state.config.name] = {
                allocated,
                textureSize: size,
                arrayDepth: depth
            }
            totalAllocated += allocated
        }
        
        return {
            lods,
            totalAllocated,
            textureCount: this.nextTextureIndex,
            instanceCount: this.currentInstanceCount,
            failedArtworkCount: this.failedArtwork.size,
            failedArtwork: this.failedArtwork
        }
    }
    
    /**
     * Log memory stats to console (uses console.group for formatting)
     */
    public logMemoryStats(): void {
        const stats = this.getMemoryStats()
        
        const lines: string[] = []
        for (const [name, lodStats] of Object.entries(stats.lods)) {
            const allocMB = (lodStats.allocated / (1024 * 1024)).toFixed(1)
            lines.push(`  ${name} (${lodStats.textureSize}px × ${lodStats.arrayDepth} slots): ${allocMB}MB`)
        }
        lines.push(`  Total: ${(stats.totalAllocated / (1024 * 1024)).toFixed(1)}MB`)
        lines.push(`  Textures: ${stats.textureCount}, Instances: ${stats.instanceCount}, Failed: ${stats.failedArtworkCount}`)
        
        log.info(`🎨 LOD Artwork Memory Stats\n${lines.join('\n')}`)
    }
    
    /**
     * Get detailed failure diagnostics - useful for debugging artwork loading issues
     * Call from console: window.lodArtworkRenderer?.getFailureDiagnostics()
     */
    public getFailureDiagnostics(): {
        summary: { total: number; byReason: Record<string, number> }
        failures: Array<{ game: string; reason: string; url: string; timestamp: number }>
    } {
        const byReason: Record<string, number> = {}
        const failures: Array<{ game: string; reason: string; url: string; timestamp: number }> = []
        
        for (const [gameName, failure] of this.failedArtwork) {
            byReason[failure.reason] = (byReason[failure.reason] || 0) + 1
            failures.push({
                game: gameName,
                reason: failure.reason,
                url: failure.url,
                timestamp: failure.timestamp
            })
        }
        
        return {
            summary: { total: this.failedArtwork.size, byReason },
            failures
        }
    }
    
    /**
     * Log failure diagnostics to console
     */
    public logFailureDiagnostics(): void {
        const diag = this.getFailureDiagnostics()
        
        if (diag.summary.total === 0) {
            log.info('🎨 No artwork failures recorded')
            return
        }
        
        const lines: string[] = [
            `🎨 Artwork Failures: ${diag.summary.total} total`,
            '  By reason:'
        ]
        
        for (const [reason, count] of Object.entries(diag.summary.byReason)) {
            lines.push(`    ${reason}: ${count}`)
        }
        
        // Show first few failures as examples
        const examples = diag.failures.slice(0, 5)
        if (examples.length > 0) {
            lines.push('  Examples:')
            for (const f of examples) {
                lines.push(`    "${f.game}" → ${f.reason}`)
            }
            if (diag.failures.length > 5) {
                lines.push(`    ... and ${diag.failures.length - 5} more`)
            }
        }
        
        log.info(lines.join('\n'))
    }
    
    public isReady(): boolean {
        return this.instancedMesh !== null
    }
    
    public getInstanceCount(): number {
        return this.currentInstanceCount
    }
    
    /**
     * Get instance data for LOD distance management
     * Returns readonly view of positions and LOD levels
     */
    public getInstanceData(): ReadonlyMap<number, { position: THREE.Vector3; lodLevel: LodLevel }> {
        return this.instanceMetadata
    }
    
    /**
     * Check if HIGH texture is loaded for an instance
     * Only relevant when lazyHighTextures is enabled
     */
    public isHighTextureLoaded(instanceIndex: number): boolean {
        if (!this.lazyHighTextures || !this.highTextureCache) {
            return true // Not using lazy loading, so HIGH is always loaded
        }
        
        const textureIndexAttr = this.geometry?.getAttribute('textureIndex') as THREE.InstancedBufferAttribute | undefined
        if (!textureIndexAttr) return false
        
        const textureIndex = Math.floor(textureIndexAttr.getX(instanceIndex))
        return this.highTextureCache.isLoaded(textureIndex)
    }
    
    /**
     * Get the HighTextureCache instance for profiling/debugging
     * Access profiling from console: renderer.getHighTextureCache().runProfilingTest(10)
     */
    public getHighTextureCache() {
        return this.highTextureCache
    }
    
    /**
     * Get HIGH texture cache stats (for debugging)
     */
    public getHighTextureCacheStats() {
        return this.highTextureCache?.getStats() ?? null
    }
    
    /**
     * Log HIGH texture cache stats
     */
    public logHighTextureCacheStats(): void {
        this.highTextureCache?.logStats()
    }
    
    /**
     * Run diagnostic to measure texture operation costs
     */
    public measureTextureCosts(): void {
        this.highTextureCache?.measureOperationCosts()
    }
    
    /**
     * Get pending HIGH promotion info (textures loaded but waiting for GPU flush)
     */
    public getPendingPromotions(): { textureIndex: number; slot: number; gameName?: string }[] {
        const result: { textureIndex: number; slot: number; gameName?: string }[] = []
        for (const [textureIndex, slot] of this.pendingHighPromotion) {
            const instanceIndex = this.textureIndexToInstance.get(textureIndex)
            const gameName = instanceIndex !== undefined 
                ? this.instanceMetadata.get(instanceIndex)?.name 
                : undefined
            result.push({ textureIndex, slot, gameName })
        }
        return result
    }
    
    /**
     * Diagnostic: Log pending promotion state
     */
    public diagnosePendingState(): void {
        const pending = this.getPendingPromotions()
        const stats = this.highTextureCache?.getStats()
        
        console.group('🔄 Pending HIGH Promotions')
        console.log(`GPU flush interval: every ${this.gpuUpdateInterval} frames`)
        console.log(`Frame counter: ${this.gpuUpdateFrameCounter}/${this.gpuUpdateInterval}`)
        console.log(`Pending promotions: ${pending.length}`)
        
        if (pending.length > 0) {
            for (const p of pending) {
                console.log(`  textureIndex ${p.textureIndex} → slot ${p.slot} "${p.gameName?.slice(0, 25) ?? '?'}"`)
            }
        }
        
        if (stats) {
            console.log(`\nCache: ${stats.loading} loading, ${stats.queueLength} queued`)
        }
        console.groupEnd()
    }
    
    /**
     * Start spatial pre-warming (call after games are loaded)
     */
    public startPrewarming(): void {
        this.spatialPrewarming?.start()
    }
    
    /**
     * Stop spatial pre-warming
     */
    public stopPrewarming(): void {
        this.spatialPrewarming?.stop()
    }
    
    /**
     * Get spatial pre-warming stats
     */
    public getPrewarmingStats() {
        return this.spatialPrewarming?.getStats() ?? null
    }
    
    public dispose(): void {
        this.instancedMesh?.removeFromParent()
        this.geometry?.dispose()
        this.material?.dispose()
        
        for (const state of this.lodTextures.values()) {
            state.dataArrayTexture?.dispose()
            state.pendingUpdates.clear()
        }
        
        this.textureSlots.clear()
        this.textureIndexToInstance.clear()
        this.instanceMetadata.clear()
        this.artworkUrls.clear()
        this.textureWorker.dispose()
        this.spatialPrewarming?.dispose()
        this.highTextureCache?.dispose()
        
        log.lifecycle('Disposed')
    }
}
