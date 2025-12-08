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

/** LOD level constants - Only HIGH and MID, no LOW */
export const LOD_LEVEL = {
    HIGH: 0,
    MID: 1
} as const

export type LodLevel = typeof LOD_LEVEL[keyof typeof LOD_LEVEL]

/** LOD configuration */
export interface LodConfig {
    level: LodLevel
    textureSize: number
    name: string
    /** Max texture array depth for this LOD (defaults to maxTextures if not set) */
    maxDepth?: number
}

/** 
 * Default LOD configurations - Two-tier system
 * HIGH: Small array (64 slots = 48MB with RGB) - dynamically loaded/evicted for nearby games
 * MID: Full array (all slots) - covers all games at reasonable quality
 */
export const DEFAULT_LOD_CONFIGS: LodConfig[] = [
    { level: LOD_LEVEL.HIGH, textureSize: 512, name: 'high', maxDepth: 64 },
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
    
    private static readonly DEFAULT_ROTATION = new THREE.Quaternion()

    constructor(config: LodArtworkConfig = {}) {
        this.maxTextures = config.maxTextures ?? 512
        this.dimensions = {
            width: config.boxWidth ?? 0.3,
            height: config.boxHeight ?? 0.4,
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
                textureSize: highConfig?.textureSize ?? 512,
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
            const vram = state.config.textureSize * state.config.textureSize * depth * 4
            totalVRAM += vram
            lodInfo.push(`${state.config.name}: ${depth} slots × ${state.config.textureSize}px = ${(vram / (1024 * 1024)).toFixed(1)}MB`)
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
            const size = state.config.textureSize
            const depth = state.arrayDepth
            const data = new Uint8Array(size * size * depth * 4)
            state.dataArrayTexture = new THREE.DataArrayTexture(data, size, size, depth)
            state.dataArrayTexture.format = THREE.RGBAFormat
            state.dataArrayTexture.type = THREE.UnsignedByteType
            state.dataArrayTexture.minFilter = THREE.LinearFilter
            state.dataArrayTexture.magFilter = THREE.LinearFilter
            state.dataArrayTexture.wrapS = THREE.ClampToEdgeWrapping
            state.dataArrayTexture.wrapT = THREE.ClampToEdgeWrapping
            state.dataArrayTexture.needsUpdate = true
            
            log.debug(`Created ${state.config.name} LOD texture array: ${size}×${size}×${depth}`)
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
                if (this.lazyHighTextures && level === LOD_LEVEL.HIGH) {
                    // Register game with cache for later loading
                    this.highTextureCache?.registerGame(textureIndex, gameName, artworkUrl)
                    continue
                }
                
                const result = await this.textureWorker.fetchAndProcess(
                    artworkUrl,
                    state.config.textureSize,
                    textureIndex,
                    gameName,
                    10000
                )
                
                // Copy to texture array
                if (!state.dataArrayTexture) {
                    throw new Error(`${state.config.name} texture array not initialized`)
                }
                const sliceSize = state.config.textureSize * state.config.textureSize * 4
                const offset = textureIndex * sliceSize
                const arrayData = state.dataArrayTexture.image.data as Uint8Array
                
                // Verify image data size matches expected
                if (result.imageData.length !== sliceSize) {
                    log.error(`Size mismatch for "${gameName}" LOD ${level}: expected ${sliceSize}, got ${result.imageData.length}`)
                }
                
                arrayData.set(result.imageData, offset)
                state.pendingUpdates.add(textureIndex)
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
            
            const msg = error instanceof Error ? error.message : String(error)
            log.debug(`Failed to add artwork for "${gameName}": ${msg}`)
            return { success: false, instanceIndex: -1 }
        }
    }
    
    /**
     * Set LOD level for a specific instance
     * With lazyHighTextures: if HIGH is requested but not loaded, triggers async load
     * and keeps instance at MID until HIGH is ready
     */
    public setInstanceLod(instanceIndex: number, lodLevel: LodLevel): boolean {
        if (!this.geometry || instanceIndex < 0 || instanceIndex >= this.currentInstanceCount) {
            log.warn(`setInstanceLod failed: invalid index ${instanceIndex} (count: ${this.currentInstanceCount})`)
            return false
        }
        
        const metadata = this.instanceMetadata.get(instanceIndex)
        const prevLod = metadata?.lodLevel
        
        // If lazy HIGH textures enabled and requesting HIGH, check if texture is loaded
        let effectiveLod = lodLevel
        if (this.lazyHighTextures && lodLevel === LOD_LEVEL.HIGH && this.highTextureCache) {
            // Get texture index for this instance
            const textureIndexAttr = this.geometry.getAttribute('textureIndex') as THREE.InstancedBufferAttribute
            const textureIndex = Math.floor(textureIndexAttr.getX(instanceIndex))
            
            // Request HIGH texture - returns slot (0-63) if loaded, -1 if not
            const highSlot = this.highTextureCache.requestHighTexture(textureIndex)
            
            if (highSlot < 0) {
                // HIGH texture not ready yet - stay at MID for now
                // onHighSlotChange callback will update when texture loads
                effectiveLod = LOD_LEVEL.MID
            }
        }
        
        const lodLevelAttr = this.geometry.getAttribute('lodLevel') as THREE.InstancedBufferAttribute
        lodLevelAttr.setX(instanceIndex, effectiveLod)
        lodLevelAttr.needsUpdate = true
        
        // Update metadata
        if (metadata) {
            metadata.lodLevel = effectiveLod
        }
        
        // Debug: Log LOD changes with game name
        if (prevLod !== effectiveLod) {
            const lodNames = ['HIGH', 'MID', 'LOW']
            log.runtime(`LOD ${instanceIndex} "${metadata?.name?.slice(0, 20) ?? '?'}": ${lodNames[prevLod ?? 0]} → ${lodNames[effectiveLod]}`)
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
     * Updates the highTextureSlot attribute AND LOD level for the affected instance
     */
    private onHighSlotChange(gameIndex: number, slot: number): void {
        if (!this.geometry || !this.highTextureSlots) return
        
        // gameIndex from HighTextureCache is actually textureIndex
        // Look up the corresponding instanceIndex
        const instanceIndex = this.textureIndexToInstance.get(gameIndex)
        if (instanceIndex === undefined) {
            log.runtime(`HIGH slot change for unknown textureIndex ${gameIndex} - no instance mapping found`)
            return
        }
        
        if (instanceIndex >= 0 && instanceIndex < this.highTextureSlots.length) {
            this.highTextureSlots[instanceIndex] = slot
            
            const highSlotAttr = this.geometry.getAttribute('highTextureSlot') as THREE.InstancedBufferAttribute
            if (highSlotAttr) {
                highSlotAttr.setX(instanceIndex, slot)
                highSlotAttr.needsUpdate = true
            }
            
            // Also update LOD level to HIGH now that the texture is ready
            if (slot >= 0) {
                const lodLevelAttr = this.geometry.getAttribute('lodLevel') as THREE.InstancedBufferAttribute
                if (lodLevelAttr && this.lodLevels) {
                    this.lodLevels[instanceIndex] = LOD_LEVEL.HIGH
                    lodLevelAttr.setX(instanceIndex, LOD_LEVEL.HIGH)
                    lodLevelAttr.needsUpdate = true
                }
                
                const metadata = this.instanceMetadata.get(instanceIndex)
                if (metadata) {
                    metadata.lodLevel = LOD_LEVEL.HIGH
                }
                
                log.runtime(`HIGH texture ready: textureIndex ${gameIndex} → instance ${instanceIndex} → slot ${slot}, LOD upgraded to HIGH`)
            }
        }
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
            
            // Check if HIGH texture cache has pending updates
            if (this.highTextureCache?.needsGpuUpdate()) {
                this.highTextureCache.flushToGpu()
            }
        }
    }

    /**
     * Update GPU resources
     * Called periodically from render loop - batches texture updates
     */
    public updateGPU(): void {
        if (!this.instancedMesh || !this.geometry) return
        
        // Update all LOD texture arrays (MID textures)
        for (const state of this.lodTextures.values()) {
            if (state.dataArrayTexture && state.pendingUpdates.size > 0) {
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
            instanceCount: this.currentInstanceCount
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
        lines.push(`  Textures: ${stats.textureCount}, Instances: ${stats.instanceCount}`)
        
        log.info(`🎨 LOD Artwork Memory Stats\n${lines.join('\n')}`)
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
