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
import { PixelDataCache } from './PixelDataCache'
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
 * Default LOD configurations - Two-tier system with same aspect ratio
 * HIGH: Half of Steam's advertised 600×900 = 300×450 (what CDN actually serves)
 * MED: Quarter resolution = 150×225 (same 2:3 portrait aspect ratio)
 * 
 * Both use library_600x900.jpg source, resized to target dimensions.
 * Same aspect ratio ensures smooth visual transition when LOD changes.
 */
export const DEFAULT_LOD_CONFIGS: LodConfig[] = [
    { level: LOD_LEVEL.HIGH, textureWidth: STEAM_CAPSULE_WIDTH, textureHeight: STEAM_CAPSULE_HEIGHT, name: 'high', maxDepth: 128 },
    { level: LOD_LEVEL.MID, textureWidth: 150, textureHeight: 225, name: 'med' }  // Quarter res, same aspect ratio
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

export interface LodTextureState {
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
    private failedArtwork: Map<string, { reason: string; url: string; urlsTried: string[]; timestamp: number }> = new Map()
    private fallbackSuccesses: Map<string, { originalUrl: string; fallbackUrl: string; fallbackType: string }> = new Map()
    private nextTextureIndex: number = 0
    private currentInstanceCount: number = 0
    
    // Persistent cache keys and TTL (24 hours)
    private static readonly FAILURE_CACHE_KEY = 'steam-artwork-failures'
    private static readonly SUCCESS_CACHE_KEY = 'steam-artwork-successes'
    private static readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000
    
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
    
    // Pixel cache for MED textures (downsampled from cached HIGH pixels)
    private pixelCache: PixelDataCache | null = null
    
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
        
        // Initialize pixel cache for MED texture cache hits (downsampled from HIGH)
        this.pixelCache = PixelDataCache.getInstance()
        this.pixelCache.init().catch(err => {
            log.warn('PixelDataCache init failed:', err)
        })
        
        // Load persistent caches to skip known-bad URLs and use known-good fallbacks
        this.loadPersistentCaches()
        
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
        const dataManager = DataManager.getInstance()
        
        for (const [_level, state] of this.lodTextures) {
            const depth = state.arrayDepth
            const width = state.config.textureWidth ?? state.config.textureSize ?? 128
            const height = state.config.textureHeight ?? state.config.textureSize ?? 128
            const vram = width * height * depth * 4
            totalVRAM += vram
            lodInfo.push(`${state.config.name}: ${depth} slots × ${width}×${height}px = ${(vram / (1024 * 1024)).toFixed(1)}MB`)
            
            // Register each LOD tier's memory consumption
            const vramMB = Math.round(vram / (1024 * 1024))
            dataManager.addMemoryConsumption(`LOD/${state.config.name}`, vramMB)
        }
        
        log.lifecycle(`LOD VRAM: ${lodInfo.join(', ')} | Total: ${(totalVRAM / (1024 * 1024)).toFixed(0)}MB`)
    }
    
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
        
        // Check if we have a cached successful fallback URL for this game
        const cachedSuccess = this.fallbackSuccesses.get(gameName)
        
        // Try primary URL first, then fallbacks if needed
        const triedUrls = new Set<string>()
        let successUrl = artworkUrl
        let usedFallback = false
        
        // Build list of URLs to try
        // If we have a cached success, use that URL first (skip known-bad primary)
        const urlsToTry: Array<{ url: string; type: string }> = []
        const extractedAppid = appid ?? this.extractAppidFromUrl(artworkUrl)
        
        // Check if primary URL is from new CDN (shared.akamai) - if so, constructed fallbacks won't work
        const isNewCdnUrl = artworkUrl.includes('shared.akamai.steamstatic.com') || 
                           artworkUrl.includes('store_item_assets')
        
        if (cachedSuccess) {
            // Use cached working URL first
            urlsToTry.push({ url: cachedSuccess.fallbackUrl, type: `cached-${cachedSuccess.fallbackType}` })
            // Add other fallbacks in case cached one stopped working (only if old CDN)
            if (extractedAppid && !isNewCdnUrl) {
                urlsToTry.push(...this.generateFallbackUrls(extractedAppid, new Set([cachedSuccess.fallbackUrl])))
            }
        } else {
            // Normal flow: try primary first, then fallbacks
            urlsToTry.push({ url: artworkUrl, type: 'primary' })
            // Only generate constructed fallbacks if using old CDN URL pattern
            // New CDN URLs (shared.akamai) won't have fallbacks at cdn.akamai
            if (extractedAppid && !isNewCdnUrl) {
                urlsToTry.push(...this.generateFallbackUrls(extractedAppid, new Set([artworkUrl])))
            }
        }
        
        let lastError: Error | null = null
        
        for (const { url: currentUrl, type: urlType } of urlsToTry) {
            triedUrls.add(currentUrl)
            
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
                    
                    let imageData: Uint8ClampedArray | null = null
                    
                    // For MED textures: check if we have HIGH pixels cached that we can downsample
                    // This saves bandwidth for returning users - downsample cached HIGH → MED
                    if (level === LOD_LEVEL.MID && this.pixelCache && this.lazyHighTextures) {
                        const portraitUrl = this.convertToPortraitUrl(currentUrl)
                        const cachedHighPixels = await this.pixelCache.get(portraitUrl)
                        
                        if (cachedHighPixels) {
                            // Cache hit! Downsample HIGH (300×450) → MED (150×225)
                            imageData = this.downsamplePixels(
                                cachedHighPixels.pixelData,
                                cachedHighPixels.width,
                                cachedHighPixels.height,
                                width,
                                height
                            )
                            log.debug(`MED cache hit for "${gameName}": downsampled ${cachedHighPixels.width}×${cachedHighPixels.height} → ${width}×${height}`)
                        }
                    }
                    
                    // If no cache hit, fetch from network
                    if (!imageData) {
                        const result = await this.textureWorker.fetchAndProcessWithOptions(
                            currentUrl,
                            textureIndex,
                            gameName,
                            {
                                textureWidth: width,
                                textureHeight: height,
                                timeout: 10000
                            }
                        )
                        imageData = result.imageData
                    }
                    
                    // Copy to texture array
                    if (!state.dataArrayTexture) {
                        throw new Error(`${state.config.name} texture array not initialized`)
                    }
                    const sliceSize = width * height * 4
                    const offset = textureIndex * sliceSize
                    const arrayData = state.dataArrayTexture.image.data as Uint8Array
                    
                    // Verify image data size matches expected
                    if (imageData.length !== sliceSize) {
                        log.error(`Size mismatch for "${gameName}" LOD ${level}: expected ${sliceSize}, got ${imageData.length}`)
                    }
                    
                    arrayData.set(imageData, offset)
                    state.pendingUpdates.add(textureIndex)
                }
                
                // Success! Track if we used a fallback (non-primary or cached fallback)
                successUrl = currentUrl
                usedFallback = urlType !== 'primary' && !urlType.startsWith('cached-')
                const usedCachedFallback = urlType.startsWith('cached-')
                
                if (usedFallback) {
                    // New fallback discovery - save it for future loads
                    log.info(`Fallback success for "${gameName}": ${urlType} (${currentUrl})`)
                    this.fallbackSuccesses.set(gameName, { 
                        originalUrl: artworkUrl, 
                        fallbackUrl: currentUrl, 
                        fallbackType: urlType 
                    })
                    // Persist so we skip the failed primary URL on next load
                    this.savePersistentSuccesses()
                } else if (usedCachedFallback) {
                    // Cached fallback still works - no need to log or re-save
                    log.debug(`Used cached fallback for "${gameName}": ${currentUrl}`)
                }
                lastError = null
                break // Success - exit URL loop
                
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error))
                log.debug(`URL failed for "${gameName}" (${urlType}): ${lastError.message}`)
                // Continue to next fallback URL
            }
        }
        
        // If all URLs failed, record failure and bail
        if (lastError) {
            this.nextTextureIndex--
            this.artworkUrls.delete(textureIndex)
            
            const reason = this.categorizeFailure(lastError.message)
            this.failedArtwork.set(gameName, { 
                reason, 
                url: artworkUrl, 
                urlsTried: Array.from(triedUrls),
                timestamp: Date.now() 
            })
            // Persist failures so we don't retry them after page refresh
            this.savePersistentFailures()
            log.debug(`All URLs failed for "${gameName}": ${reason} (tried ${triedUrls.size} URLs)`)
            return { success: false, instanceIndex: -1 }
        }
        
        try {
            // MID loading succeeded - now register with HighTextureCache for lazy HIGH loading
            // This is done AFTER MID succeeds to avoid registering games with inaccessible artwork
            // Use the successful URL (may be fallback) for HIGH texture loading
            if (this.lazyHighTextures) {
                this.highTextureCache?.registerGame(textureIndex, gameName, successUrl)
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
            // This catch is for errors AFTER texture loading succeeded (instance setup)
            // Texture loading failures are handled in the URL loop above
            this.nextTextureIndex--
            this.artworkUrls.delete(textureIndex)
            
            const msg = error instanceof Error ? error.message : String(error)
            log.error(`Instance setup failed for "${gameName}": ${msg}`)
            return { success: false, instanceIndex: -1 }
        }
    }
    
    /**
     * Steam CDN fallback URL patterns - ONLY used when metadata URLs fail
     * These are constructed URLs that work for MOST games on the old CDN
     * but may fail for newer games on shared.akamai.steamstatic.com
     * 
     * Note: Primary artwork URLs should come from Steam API metadata (artwork.header, artwork.library)
     * which can point to either CDN correctly. These fallbacks are a last resort.
     * 
     * IMPORTANT: library_600x900.jpg (portrait) is first because both LOD levels use portrait aspect ratio.
     */
    private static readonly FALLBACK_PATTERNS = [
        { pattern: 'library_600x900.jpg', name: 'constructed-library' },  // Portrait - preferred for 2:3 aspect ratio
        { pattern: 'header.jpg', name: 'constructed-header' },            // Landscape - fallback only
        { pattern: 'capsule_616x353.jpg', name: 'constructed-capsule' }   // Landscape - last resort
    ] as const
    
    private loadPersistentCaches(): void {
        const now = Date.now()
        
        // Load failures
        try {
            const cached = localStorage.getItem(LodArtworkRenderer.FAILURE_CACHE_KEY)
            if (cached) {
                const data = JSON.parse(cached) as Record<string, { reason: string; url: string; urlsTried: string[]; timestamp: number }>
                let loadedCount = 0
                
                for (const [gameName, failure] of Object.entries(data)) {
                    if (now - failure.timestamp > LodArtworkRenderer.CACHE_TTL_MS) continue
                    this.failedArtwork.set(gameName, failure)
                    loadedCount++
                }
                
                if (loadedCount > 0) {
                    log.info(`Loaded ${loadedCount} cached artwork failures (skipping retries)`)
                }
            }
        } catch (error) {
            log.debug('Could not load failure cache:', error)
        }
        
        // Load fallback successes - these tell us which URL to use directly
        try {
            const cached = localStorage.getItem(LodArtworkRenderer.SUCCESS_CACHE_KEY)
            if (cached) {
                const data = JSON.parse(cached) as Record<string, { originalUrl: string; fallbackUrl: string; fallbackType: string; timestamp: number }>
                let loadedCount = 0
                
                for (const [gameName, success] of Object.entries(data)) {
                    if (now - success.timestamp > LodArtworkRenderer.CACHE_TTL_MS) continue
                    this.fallbackSuccesses.set(gameName, success)
                    loadedCount++
                }
                
                if (loadedCount > 0) {
                    log.info(`Loaded ${loadedCount} cached fallback URLs (skipping primary attempts)`)
                }
            }
        } catch (error) {
            log.debug('Could not load success cache:', error)
        }
    }
    
    private savePersistentFailures(): void {
        try {
            const data: Record<string, { reason: string; url: string; urlsTried: string[]; timestamp: number }> = {}
            for (const [gameName, failure] of this.failedArtwork) {
                data[gameName] = failure
            }
            localStorage.setItem(LodArtworkRenderer.FAILURE_CACHE_KEY, JSON.stringify(data))
        } catch (error) {
            log.debug('Could not save failure cache:', error)
        }
    }
    
    private savePersistentSuccesses(): void {
        try {
            const data: Record<string, { originalUrl: string; fallbackUrl: string; fallbackType: string; timestamp: number }> = {}
            for (const [gameName, success] of this.fallbackSuccesses) {
                data[gameName] = { ...success, timestamp: Date.now() }
            }
            localStorage.setItem(LodArtworkRenderer.SUCCESS_CACHE_KEY, JSON.stringify(data))
        } catch (error) {
            log.debug('Could not save success cache:', error)
        }
    }
    
    public clearFailureCache(): void {
        this.failedArtwork.clear()
        this.fallbackSuccesses.clear()
        try {
            localStorage.removeItem(LodArtworkRenderer.FAILURE_CACHE_KEY)
            localStorage.removeItem(LodArtworkRenderer.SUCCESS_CACHE_KEY)
            log.info('Cleared artwork caches - all URLs will be retried on next load')
        } catch (error) {
            log.debug('Could not clear caches:', error)
        }
    }
    
    private generateFallbackUrls(appid: number, triedUrls: Set<string>): Array<{ url: string; type: string }> {
        const baseUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${appid}`
        return LodArtworkRenderer.FALLBACK_PATTERNS
            .map(p => ({ url: `${baseUrl}/${p.pattern}`, type: p.name }))
            .filter(f => !triedUrls.has(f.url))
    }
    
    private extractAppidFromUrl(url: string): number | null {
        const match = url.match(/\/apps\/(\d+)\//)
        return match ? parseInt(match[1], 10) : null
    }
    
    /**
     * Convert any Steam artwork URL to portrait format (library_600x900.jpg)
     * This matches the URL format used by PixelDataCache/HighTextureCache
     */
    private convertToPortraitUrl(artworkUrl: string): string {
        const appidMatch = artworkUrl.match(/\/apps\/(\d+)\//)
        if (!appidMatch) {
            return artworkUrl
        }
        const appid = appidMatch[1]
        return `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`
    }
    
    /**
     * Downsample pixel data from HIGH resolution (300×450) to MED resolution (150×225)
     * Uses simple 2x2 box filter for fast, decent quality downsampling
     */
    private downsamplePixels(
        srcPixels: Uint8ClampedArray,
        srcWidth: number,
        srcHeight: number,
        dstWidth: number,
        dstHeight: number
    ): Uint8ClampedArray {
        const dst = new Uint8ClampedArray(dstWidth * dstHeight * 4)
        
        // Calculate scale factors
        const scaleX = srcWidth / dstWidth
        const scaleY = srcHeight / dstHeight
        
        for (let dstY = 0; dstY < dstHeight; dstY++) {
            for (let dstX = 0; dstX < dstWidth; dstX++) {
                // Source region for this destination pixel
                const srcX0 = Math.floor(dstX * scaleX)
                const srcY0 = Math.floor(dstY * scaleY)
                const srcX1 = Math.min(Math.ceil((dstX + 1) * scaleX), srcWidth)
                const srcY1 = Math.min(Math.ceil((dstY + 1) * scaleY), srcHeight)
                
                // Average all source pixels in the region
                let r = 0, g = 0, b = 0, a = 0
                let count = 0
                
                for (let sy = srcY0; sy < srcY1; sy++) {
                    for (let sx = srcX0; sx < srcX1; sx++) {
                        const srcIdx = (sy * srcWidth + sx) * 4
                        r += srcPixels[srcIdx]
                        g += srcPixels[srcIdx + 1]
                        b += srcPixels[srcIdx + 2]
                        a += srcPixels[srcIdx + 3]
                        count++
                    }
                }
                
                const dstIdx = (dstY * dstWidth + dstX) * 4
                dst[dstIdx] = Math.round(r / count)
                dst[dstIdx + 1] = Math.round(g / count)
                dst[dstIdx + 2] = Math.round(b / count)
                dst[dstIdx + 3] = Math.round(a / count)
            }
        }
        
        return dst
    }
    
    private categorizeFailure(errorMsg: string): string {
        const lowerMsg = errorMsg.toLowerCase()
        if (lowerMsg.includes('cors blocked')) {
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
        // Default network errors are likely 404s with bad CORS headers
        if (lowerMsg.includes('network') || lowerMsg.includes('failed to fetch')) {
            return 'NETWORK'
        }
        return 'UNKNOWN'
    }
    
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
    
    public getInstanceLod(instanceIndex: number): LodLevel | null {
        const metadata = this.instanceMetadata.get(instanceIndex)
        return metadata?.lodLevel ?? null
    }
    
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
    
    public isReady(): boolean {
        return this.instancedMesh !== null
    }
    
    public getInstanceCount(): number {
        return this.currentInstanceCount
    }
    
    public getInstanceData(): ReadonlyMap<number, { position: THREE.Vector3; lodLevel: LodLevel }> {
        return this.instanceMetadata
    }
    
    public isHighTextureLoaded(instanceIndex: number): boolean {
        if (!this.lazyHighTextures || !this.highTextureCache) {
            return true // Not using lazy loading, so HIGH is always loaded
        }
        
        const textureIndexAttr = this.geometry?.getAttribute('textureIndex') as THREE.InstancedBufferAttribute | undefined
        if (!textureIndexAttr) return false
        
        const textureIndex = Math.floor(textureIndexAttr.getX(instanceIndex))
        return this.highTextureCache.isLoaded(textureIndex)
    }
    
    public getHighTextureCache() {
        return this.highTextureCache
    }
    
    public startPrewarming(): void {
        this.spatialPrewarming?.start()
    }
    
    public stopPrewarming(): void {
        this.spatialPrewarming?.stop()
    }
    
    // =================================================================
    // Protected accessors for subclass (LodArtworkRendererDebug)
    // =================================================================
    
    protected getLodTextures(): Map<LodLevel, LodTextureState> {
        return this.lodTextures
    }
    
    protected getFailedArtwork(): Map<string, { reason: string; url: string; urlsTried: string[]; timestamp: number }> {
        return this.failedArtwork
    }
    
    protected getFallbackSuccesses(): Map<string, { originalUrl: string; fallbackUrl: string; fallbackType: string }> {
        return this.fallbackSuccesses
    }
    
    protected getNextTextureIndex(): number {
        return this.nextTextureIndex
    }
    
    protected getInstanceMetadata(): Map<number, InstanceMetadata & { lodLevel: LodLevel }> {
        return this.instanceMetadata
    }
    
    protected getTextureIndexToInstance(): Map<number, number> {
        return this.textureIndexToInstance
    }
    
    protected getPendingHighPromotion(): Map<number, number> {
        return this.pendingHighPromotion
    }
    
    protected getGpuUpdateInterval(): number {
        return this.gpuUpdateInterval
    }
    
    protected getGpuUpdateFrameCounter(): number {
        return this.gpuUpdateFrameCounter
    }
    
    protected getSpatialPrewarming(): SpatialPrewarmingManager | null {
        return this.spatialPrewarming
    }
    
    public dispose(): void {
        this.instancedMesh?.removeFromParent()
        this.geometry?.dispose()
        this.material?.dispose()
        
        const dataManager = DataManager.getInstance()
        for (const state of this.lodTextures.values()) {
            state.dataArrayTexture?.dispose()
            state.pendingUpdates.clear()
            // Unregister memory consumption
            dataManager.removeMemoryConsumption(`LOD/${state.config.name}`)
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
