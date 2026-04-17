/**
 * HIGH Texture Cache - LRU cache for high-resolution (512px) textures
 * 
 * Memory optimization: Instead of loading all HIGH textures upfront (~512MB for 512 games),
 * we only keep a limited number loaded (~64 textures = ~64MB) and dynamically
 * load/evict based on which games are actually at HIGH LOD.
 * 
 * Key Architecture:
 * - HIGH array has limited slots (e.g., 64)
 * - Games (0 to N) are dynamically mapped to available slots
 * - When a slot is needed: evict LRU, assign slot to new game, notify callback
 * - Shader uses highTextureSlot attribute (0-63 or -1 if not loaded)
 * 
 * Flow:
 * 1. Game added → MID texture loaded immediately (always available)
 * 2. LOD manager sets game to HIGH → Cache loads HIGH texture if slot available
 * 3. Cache full → Evict LRU game, notify via callback, assign slot to new game
 * 4. Evicted game set to HIGH again → Reload from network/disk cache
 */

import * as THREE from 'three'
import { Logger } from '../../../utils/Logger'
import { TextureWorker } from './TextureWorker'
import { PixelDataCache } from './PixelDataCache'
import { FrameBudgetScheduler } from '../../../utils/FrameBudgetScheduler'
import { ManagedTextureArray } from './ManagedTextureArray'
import { LOD_TIER_NAME } from './ILodArtworkRenderer'
import { LOD_DEBUG_SETTINGS } from './LodDebugSettings'
import { HighSlotAllocator } from './HighSlotAllocator'

// Logger will be attached to the class below

/** State of a HIGH texture for a game */
export enum HighTextureState {
    /** No HIGH texture loaded for this game */
    EMPTY = 'empty',
    /** Pixel data is being cached in background (stay on MID) */
    CACHING = 'caching',
    /** HIGH texture is currently being loaded from cache */
    LOADING = 'loading',
    /** HIGH texture is loaded and ready */
    LOADED = 'loaded',
    /** Loading failed - will retry on next request (up to maxLoadAttempts) */
    FAILED = 'failed',
    /** Permanently failed - will never retry (CORS, 404, etc) */
    PERMANENT_FAILURE = 'permanent_failure'
}

export interface HighTextureCacheConfig {
    /** Total slots in the HIGH texture array (e.g., 64) */
    totalSlots: number
    /** Width of HIGH textures (native Steam header = 460) */
    textureWidth: number
    /** Height of HIGH textures (native Steam header = 215) */
    textureHeight: number
    /** Maximum concurrent texture loads (throttling) */
    maxConcurrentLoads: number
    /** Maximum load attempts before permanent failure (default: 2) */
    maxLoadAttempts?: number
}

/** Callback when a game's HIGH slot assignment changes */
export type SlotChangeCallback = (gameIndex: number, slot: number) => void

interface GameEntry {
    /** Game index (texture index in MID array) */
    gameIndex: number
    /** Game name for debugging/logging */
    gameName: string
    /** URL to load HIGH texture from */
    artworkUrl: string
    /** Current state */
    state: HighTextureState
    /** Assigned slot in HIGH array (-1 if not assigned) */
    highSlot: number
    /** Last access timestamp for LRU */
    lastAccessTime: number
    /** Load attempt count for retry logic */
    loadAttempts: number
}

export interface HighTextureCacheStats {
    loaded: number
    loading: number
    caching: number
    failed: number
    permanentFailures: number
    empty: number
    totalSlots: number
    usedSlots: number
    evictions: number
    cacheHits: number
    cacheMisses: number
    pixelCacheHits: number
    pixelCacheMisses: number
    queueLength: number
    activeLoads: number
    backgroundCacheQueue: number
}

export class HighTextureCache {
    public static logger = Logger.createLogFunctions(HighTextureCache.name)
    private readonly config: HighTextureCacheConfig
    private readonly textureWorker: TextureWorker
    private readonly pixelCache: PixelDataCache

    private managedArray: ManagedTextureArray | null = null
    private readonly slotAllocator: HighSlotAllocator
    
    /** Game entries by game index */
    private games: Map<number, GameEntry> = new Map()
    
    /** Slot allocation snapshot for debug output */
    private slotToGame: number[]
    
    /** Currently loading game indices (to prevent duplicate loads) */
    private loadingPromises: Map<number, Promise<boolean>> = new Map()
    
    /** Queue of game indices waiting to load (throttled) */
    private loadQueue: number[] = []
    
    /** Games currently being background-cached (pixel cache warming, no slot allocated yet) */
    private backgroundCachingGames: Set<number> = new Set()
    
    /** Callback to notify when slot assignments change */
    private onSlotChange: SlotChangeCallback | null = null
    
    /** Stats for monitoring */
    private stats = {
        evictions: 0,
        cacheHits: 0,
        cacheMisses: 0,
        pixelCacheHits: 0,
        pixelCacheMisses: 0
    }
    
    /** Timing samples for diagnostics (circular buffer, most recent 100 loads) */
    private timingSamples: Array<{
        gameIndex: number
        gameName: string
        fetchTime: number
        processTime: number
        copyTime: number
        totalTime: number
        timestamp: number
        pixelCacheHit: boolean
    }> = []
    private readonly MAX_TIMING_SAMPLES = 100
    
    /** Detailed profiling samples (optional, for deep analysis) */
    private profilingSamples: Array<{
        gameIndex: number
        gameName: string
        workerRoundTrip: number
        arrayBufferCopy: number
        textureArrayCopy: number
        callbackTime: number
        totalMainThread: number
        pixelCacheHit: boolean
        timestamp: number
    }> = []
    private profilingEnabled = false
    private readonly MAX_PROFILING_SAMPLES = 50
    
    /** Frame budget scheduler for deferring texture copies */
    private readonly scheduler: FrameBudgetScheduler
    
    constructor(config: Partial<HighTextureCacheConfig> = {}) {
        this.config = {
            totalSlots: config.totalSlots ?? 64,
            textureWidth: config.textureWidth ?? 600,
            textureHeight: config.textureHeight ?? 900,
            maxConcurrentLoads: config.maxConcurrentLoads ?? 2
        }
        
        this.slotAllocator = new HighSlotAllocator(this.config.totalSlots)
        this.slotToGame = this.slotAllocator.getSnapshot().slotToGame

        const debugStripe = LOD_DEBUG_SETTINGS.stripeEnabled ? LOD_DEBUG_SETTINGS.stripeColors[LOD_TIER_NAME.HIGH] : undefined
        this.managedArray = new ManagedTextureArray({
            width: this.config.textureWidth,
            height: this.config.textureHeight,
            depth: this.config.totalSlots,
            debugStripe
        })
        
        this.textureWorker = new TextureWorker()
        this.pixelCache = PixelDataCache.getInstance()
        this.scheduler = FrameBudgetScheduler.getInstance()
        
        HighTextureCache.logger.lifecycle(`Initialized: ${this.config.totalSlots} slots, ${this.config.maxConcurrentLoads} concurrent loads (${this.estimateMemoryMB()}MB)`)
    }
    
    /**
     * Set callback for slot changes (called by LodArtworkRenderer)
     */
    public setSlotChangeCallback(callback: SlotChangeCallback): void {
        this.onSlotChange = callback
    }
    
    /**
     * Get the HIGH texture array for passing to the shader uniform.
     * HighTextureCache owns this texture from construction.
     */
    public getTexture(): THREE.DataArrayTexture {
        return this.managedArray!.texture
    }

    /** Check if texture data has changed and needs GPU upload */
    public needsGpuUpdate(): boolean {
        return this.managedArray!.hasPendingUpdates()
    }

    /**
     * Flush dirty texture data to GPU using PARTIAL layer updates.
     * Returns true if an update was performed.
     */
    public flushToGpu(): boolean {
        const count = this.managedArray!.pendingCount
        if (count === 0) return false
        const flushed = this.managedArray!.flushPendingToGpu()
        if (flushed) {
            HighTextureCache.logger.debug(`GPU flush: ${count} slot(s) → ~${(count * this.config.textureWidth * this.config.textureHeight * 4 / 1024).toFixed(0)}KB upload`)
        }
        return flushed
    }
    
    /**
     * Convert any Steam artwork URL to portrait format (library_600x900.jpg)
     * HIGH textures need portrait format (300x450) not header format (460x215)
     * 
     * Handles both CDN domains:
     * - cdn.akamai.steamstatic.com/steam/apps/{appid}/header.jpg
     * - shared.akamai.steamstatic.com/store_item_assets/steam/apps/{appid}/header.jpg
     */
    private convertToPortraitUrl(artworkUrl: string): string {
        // Extract appid from URL patterns like:
        // https://cdn.akamai.steamstatic.com/steam/apps/1145350/header.jpg
        // https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1145350/.../header.jpg
        const appidMatch = artworkUrl.match(/\/apps\/(\d+)\//)
        if (!appidMatch) {
            HighTextureCache.logger.warn(`Could not extract appid from URL: ${artworkUrl}`)
            return artworkUrl // Return original if can't parse
        }
        
        const appid = appidMatch[1]
        // Use cdn.akamai domain for portrait images (more reliable for library art)
        return `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`
    }
    
    /**
     * Register a game (called when a game is added)
     * Does NOT load the HIGH texture - just records that the game exists
     * 
     * Note: The artwork URL is converted to portrait format (library_600x900.jpg)
     * because HIGH textures expect 300x450 portrait dimensions, not 460x215 header dimensions.
     */
    public registerGame(gameIndex: number, gameName: string, artworkUrl: string): void {
        if (this.games.has(gameIndex)) {
            return // Already registered
        }
        
        // Convert to portrait URL for HIGH textures
        const portraitUrl = this.convertToPortraitUrl(artworkUrl)
        
        this.games.set(gameIndex, {
            gameIndex,
            gameName,
            artworkUrl: portraitUrl,
            state: HighTextureState.EMPTY,
            highSlot: -1,
            lastAccessTime: 0,
            loadAttempts: 0
        })
    }
    
    /**
     * Mark a game as permanently failed (e.g., CORS error during MID loading)
     * This prevents wasting network requests on artwork we know doesn't exist or isn't accessible
     */
    public markAsPermanentlyFailed(gameIndex: number, reason?: string): void {
        const entry = this.games.get(gameIndex)
        if (entry) {
            entry.state = HighTextureState.PERMANENT_FAILURE
            HighTextureCache.logger.info(`Game "${entry.gameName}" marked as permanent failure${reason ? `: ${reason}` : ''}`)
        }
    }
    
    /**
     * Unregister a game (e.g., when MID loading fails and we rollback)
     */
    public unregisterGame(gameIndex: number): void {
        this.games.delete(gameIndex)
    }
    
    /**
     * Request HIGH texture for a game
     * Returns the HIGH slot if loaded, otherwise triggers async load and returns -1
     * @returns HIGH slot (0-63) if ready, -1 if loading or unavailable
     */
    public requestHighTexture(gameIndex: number): number {
        const entry = this.games.get(gameIndex)
        if (!entry) {
            HighTextureCache.logger.warn(`requestHighTexture: unknown game ${gameIndex}`)
            return -1
        }
        
        // Update access time for LRU
        entry.lastAccessTime = window.performance.now()
        
        switch (entry.state) {
            case HighTextureState.LOADED:
                this.stats.cacheHits++
                HighTextureCache.logger.debug(`REQUEST game ${gameIndex} "${entry.gameName.slice(0, 15)}" → HIT slot ${entry.highSlot}`)
                return entry.highSlot
                
            case HighTextureState.LOADING:
                // Already loading - return -1, caller should use MID for now
                HighTextureCache.logger.debug(`REQUEST game ${gameIndex} "${entry.gameName.slice(0, 15)}" → LOADING (wait)`)
                return -1
                
            case HighTextureState.CACHING:
                // Background caching in progress - check if cache is now ready
                if (this.backgroundCachingGames.has(gameIndex)) {
                    // Still caching, stay on MID
                    HighTextureCache.logger.debug(`REQUEST game ${gameIndex} "${entry.gameName.slice(0, 15)}" → CACHING (wait)`)
                    return -1
                }
                // Background caching finished - transition to EMPTY so next request loads from cache
                entry.state = HighTextureState.EMPTY
                // Now trigger load which will hit pixel cache (fast path)
                this.stats.cacheMisses++
                HighTextureCache.logger.debug(`REQUEST game ${gameIndex} "${entry.gameName.slice(0, 15)}" → CACHE READY (triggering fast load)`)
                this.triggerLoad(entry)
                return -1
                
            case HighTextureState.PERMANENT_FAILURE:
                // Permanently failed (CORS, 404, etc) - never retry
                HighTextureCache.logger.debug(`REQUEST game ${gameIndex} "${entry.gameName.slice(0, 15)}" → PERMANENT FAILURE (skipped)`)
                return -1
                
            case HighTextureState.FAILED:
                // Check retry limit
                if (entry.loadAttempts >= (this.config.maxLoadAttempts ?? 2)) {
                    entry.state = HighTextureState.PERMANENT_FAILURE
                    HighTextureCache.logger.info(`Game "${entry.gameName}" exceeded max load attempts (${entry.loadAttempts}), marking as permanent failure`)
                    return -1
                }
                // Retry load - fall through to EMPTY handling
                this.stats.cacheMisses++
                HighTextureCache.logger.debug(`REQUEST game ${gameIndex} "${entry.gameName.slice(0, 15)}" → RETRY (attempt ${entry.loadAttempts + 1})`)
                this.triggerLoad(entry)
                return -1
                
            case HighTextureState.EMPTY:
                // Need to load - trigger async load
                this.stats.cacheMisses++
                HighTextureCache.logger.debug(`REQUEST game ${gameIndex} "${entry.gameName.slice(0, 15)}" → MISS (triggering load)`)
                this.triggerLoad(entry)
                return -1
        }
    }
    
    /**
     * Get the HIGH slot for a game (-1 if not loaded)
     */
    public getHighSlot(gameIndex: number): number {
        return this.games.get(gameIndex)?.highSlot ?? -1
    }
    
    /**
     * Check if HIGH texture is loaded for a game
     */
    public isLoaded(gameIndex: number): boolean {
        return this.games.get(gameIndex)?.state === HighTextureState.LOADED
    }
    
    /**
     * Get current state of a game's HIGH texture
     */
    public getState(gameIndex: number): HighTextureState {
        return this.games.get(gameIndex)?.state ?? HighTextureState.EMPTY
    }
    
    /**
     * Trigger async load for a HIGH texture (throttled)
     */
    private triggerLoad(entry: GameEntry): void {
        // Already loading or queued?
        if (this.loadingPromises.has(entry.gameIndex)) {
            HighTextureCache.logger.debug(`TRIGGER game ${entry.gameIndex} → already loading, skip`)
            return
        }
        if (this.loadQueue.includes(entry.gameIndex)) {
            HighTextureCache.logger.debug(`TRIGGER game ${entry.gameIndex} → already queued at position ${this.loadQueue.indexOf(entry.gameIndex)}`)
            return
        }
        
        // Check if we're at the concurrent load limit
        if (this.loadingPromises.size >= this.config.maxConcurrentLoads) {
            // Queue for later
            this.loadQueue.push(entry.gameIndex)
            HighTextureCache.logger.debug(`TRIGGER game ${entry.gameIndex} "${entry.gameName.slice(0, 15)}" → QUEUED (pos ${this.loadQueue.length}, active: ${this.loadingPromises.size})`)
            return
        }
        
        HighTextureCache.logger.debug(`TRIGGER game ${entry.gameIndex} "${entry.gameName.slice(0, 15)}" → starting load`)
        this.startLoad(entry)
    }
    
    /**
     * Actually start loading a texture (called when under concurrent limit)
     */
    private startLoad(entry: GameEntry): void {
        // Allocate a slot (may evict if full)
        const slot = this.allocateSlot(entry.gameIndex)
        if (slot < 0) {
            HighTextureCache.logger.warn(`Cannot load HIGH texture ${entry.gameIndex}: no slots available`)
            return
        }
        
        entry.highSlot = slot
        entry.state = HighTextureState.LOADING
        entry.loadAttempts++
        
        const loadPromise = this.loadHighTexture(entry)
        this.loadingPromises.set(entry.gameIndex, loadPromise)
        
        loadPromise.finally(() => {
            this.loadingPromises.delete(entry.gameIndex)
            // Process next in queue
            this.processQueue()
        })
    }
    
    /**
     * Allocate a slot for a game, evicting LRU if necessary
     * @returns slot index (0-63), or -1 if allocation failed
     */
    private allocateSlot(gameIndex: number): number {
        const loadedEntries = Array.from(this.games.values())
            .filter(entry => entry.state === HighTextureState.LOADED)
            .map(entry => ({
                gameIndex: entry.gameIndex,
                highSlot: entry.highSlot,
                lastAccessTime: entry.lastAccessTime,
            }))

        const { slot, evictedGameIndex } = this.slotAllocator.allocate(gameIndex, loadedEntries)
        if (slot < 0) {
            return -1
        }

        if (evictedGameIndex >= 0 && evictedGameIndex !== gameIndex) {
            const evictedEntry = this.games.get(evictedGameIndex)
            if (evictedEntry && evictedEntry.highSlot >= 0) {
                evictedEntry.state = HighTextureState.EMPTY
                evictedEntry.highSlot = -1
                this.stats.evictions++
                if (this.onSlotChange) {
                    this.onSlotChange(evictedGameIndex, -1)
                }
                HighTextureCache.logger.runtime(`Evicted game ${evictedEntry.gameIndex} from slot ${slot} "${evictedEntry.gameName.slice(0, 20)}"`)
            }
        }

        this.slotToGame = this.slotAllocator.getSnapshot().slotToGame
        return slot
    }
    
    /**
     * Process the load queue, starting loads up to the concurrent limit
     */
    private processQueue(): void {
        while (
            this.loadQueue.length > 0 &&
            this.loadingPromises.size < this.config.maxConcurrentLoads
        ) {
            const gameIndex = this.loadQueue.shift()
            if (gameIndex === undefined) break
            
            const entry = this.games.get(gameIndex)
            
            if (entry && entry.state !== HighTextureState.LOADED && entry.state !== HighTextureState.LOADING) {
                this.startLoad(entry)
            }
        }
    }
    
    /**
     * Start background caching for a game (fetch + decode + store in pixel cache)
     * This runs in the background without blocking HIGH texture loading
     * When complete, the game will be re-requested and load from pixel cache (fast path)
     */
    private startBackgroundCaching(entry: GameEntry): void {
        if (this.backgroundCachingGames.has(entry.gameIndex)) {
            return // Already caching
        }
        
        this.backgroundCachingGames.add(entry.gameIndex)
        HighTextureCache.logger.debug(`BACKGROUND CACHE START ${entry.gameIndex} "${entry.gameName.slice(0, 15)}"`)
        
        // Fire and forget - fetch, decode to target size, and store in pixel cache
        this.textureWorker.fetchAndProcessWithOptions(
            entry.artworkUrl,
            entry.gameIndex,
            entry.gameName,
            {
                textureWidth: this.config.textureWidth,
                textureHeight: this.config.textureHeight,
                timeout: 15000
            }
        ).then(async (result) => {
            // Verify dimensions
            if (result.width !== this.config.textureWidth || result.height !== this.config.textureHeight) {
                HighTextureCache.logger.warn(`BACKGROUND CACHE: size mismatch for "${entry.gameName}": expected ${this.config.textureWidth}×${this.config.textureHeight}, got ${result.width}×${result.height}`)
                entry.state = HighTextureState.FAILED
                this.backgroundCachingGames.delete(entry.gameIndex)
                return
            }
            
            // Store in pixel cache
            await this.pixelCache.put(entry.artworkUrl, result.imageData, result.width, result.height)
            
            HighTextureCache.logger.debug(`BACKGROUND CACHE COMPLETE ${entry.gameIndex} "${entry.gameName.slice(0, 15)}" (${result.width}×${result.height})`)
            this.backgroundCachingGames.delete(entry.gameIndex)
            // Entry stays in CACHING state - next requestHighTexture() will detect cache ready
        }).catch((err) => {
            const msg = err instanceof Error ? err.message : String(err)
            HighTextureCache.logger.debug(`BACKGROUND CACHE FAILED ${entry.gameIndex} "${entry.gameName.slice(0, 15)}": ${msg}`)
            entry.state = HighTextureState.FAILED
            this.backgroundCachingGames.delete(entry.gameIndex)
        })
    }

    /**
     * Actually load a HIGH texture - first checks pixel cache, defers to background on miss
     */
    private async loadHighTexture(entry: GameEntry): Promise<boolean> {
        if (!this.managedArray) {
            HighTextureCache.logger.warn('Cannot load HIGH texture: texture array not set')
            entry.state = HighTextureState.FAILED
            return false
        }
        
        if (entry.highSlot < 0) {
            HighTextureCache.logger.warn('Cannot load HIGH texture: no slot assigned')
            entry.state = HighTextureState.FAILED
            return false
        }
        
        const loadStart = window.performance.now()
        let workerRoundTrip = 0
        let arrayBufferCopyTime = 0
        
        try {
            HighTextureCache.logger.debug(`START HIGH ${entry.gameIndex} → slot ${entry.highSlot} "${entry.gameName.slice(0, 20)}" | in-flight: ${this.loadingPromises.size}/${this.config.maxConcurrentLoads}, queue: ${this.loadQueue.length}`)
            
            // First, check the pixel cache for decoded RGBA data
            const fetchStart = window.performance.now()
            const cachedPixels = await this.pixelCache.get(entry.artworkUrl, this.config.textureWidth, this.config.textureHeight)
            workerRoundTrip = window.performance.now() - fetchStart
            
            let imageData: Uint8ClampedArray
            let processTime = 0
            let pixelCacheHit = false
            
            if (cachedPixels) {
                // Pixel cache HIT - schedule the processing to avoid frame spikes
                // when multiple worker responses arrive in the same frame
                this.stats.pixelCacheHits++
                pixelCacheHit = true
                
                // Measure time to access the transferred ArrayBuffer data
                const bufferAccessStart = window.performance.now()
                imageData = cachedPixels.pixelData
                // Force array access to measure actual time (not just reference assignment)
                const _len = imageData.length
                arrayBufferCopyTime = window.performance.now() - bufferAccessStart
                
                processTime = 0 // No decode needed
                HighTextureCache.logger.debug(`PIXEL CACHE HIT ${entry.gameIndex} "${entry.gameName.slice(0, 15)}" (${cachedPixels.width}×${cachedPixels.height})`)
            } else {
                // Pixel cache MISS - defer to background caching to avoid main thread lag
                // Release the slot and set CACHING state so we don't block
                this.stats.pixelCacheMisses++
                HighTextureCache.logger.debug(`PIXEL CACHE MISS ${entry.gameIndex} "${entry.gameName.slice(0, 15)}" → deferring to background caching`)
                
                // Release the allocated slot
                if (entry.highSlot >= 0) {
                    this.slotAllocator.clearSlot(entry.highSlot)
                    this.slotToGame = this.slotAllocator.getSnapshot().slotToGame
                    entry.highSlot = -1
                }
                
                // Start background caching (fire and forget)
                this.startBackgroundCaching(entry)
                
                // Set state to CACHING - will be re-requested when cache is ready
                entry.state = HighTextureState.CACHING
                return false
            }
            
            const fetchTime = window.performance.now() - fetchStart
            
            // Verify size matches texture array expectations
            const expectedSize = this.config.textureWidth * this.config.textureHeight * 4
            if (imageData.length !== expectedSize) {
                HighTextureCache.logger.warn(`HIGH texture data size mismatch for "${entry.gameName}": expected ${expectedSize}, got ${imageData.length}`)
                entry.state = HighTextureState.FAILED
                return false
            }
            
            // Schedule the texture copy to run when we have frame budget
            const capturedGameIndex = entry.gameIndex
            const capturedSlot = entry.highSlot
            const capturedGameName = entry.gameName
            
            // Schedule entire completion: copy + state update + callback
            const doTextureCompletion = () => {
                const copyStart = window.performance.now()
                // Pixel write + dirty-slot tracking + optional debug stripe via ManagedTextureArray
                this.managedArray!.setSlotPixels(capturedSlot, imageData)
                const copyTime = window.performance.now() - copyStart
                
                // State updates happen in the scheduled task
                entry.state = HighTextureState.LOADED
                entry.lastAccessTime = window.performance.now()
                
                // Notify callback so renderer can update highTextureSlot attribute
                if (this.onSlotChange) {
                    this.onSlotChange(capturedGameIndex, capturedSlot)
                }
                
                // Record profiling if enabled
                if (this.profilingEnabled) {
                    this.recordProfilingSample({
                        gameIndex: capturedGameIndex,
                        gameName: capturedGameName,
                        workerRoundTrip,
                        arrayBufferCopy: arrayBufferCopyTime,
                        textureArrayCopy: copyTime,
                        callbackTime: 0,
                        totalMainThread: arrayBufferCopyTime + copyTime,
                        pixelCacheHit,
                        timestamp: window.performance.now()
                    })
                }
            }
            
            // Use tryExecuteOrSchedule: runs immediately if we have budget, otherwise schedules
            const executedImmediately = this.scheduler.tryExecuteOrSchedule(doTextureCompletion, {
                estimatedMs: 0.5,  // Based on profiling: avg 0.2ms, max 1ms
                priority: 'normal',
                maxDeferMs: 500   // Don't wait more than 500ms (30 frames at 60fps)
            })
            
            const totalTime = window.performance.now() - loadStart
            const inFlight = this.loadingPromises.size - 1  // -1 because this one is about to complete
            const cacheStatus = pixelCacheHit ? '🟢 PIXEL HIT' : '🔴 PIXEL MISS'
            const scheduled = executedImmediately ? 'immediate' : 'scheduled'
            HighTextureCache.logger.debug(`COMPLETE HIGH ${entry.gameIndex} → slot ${capturedSlot} "${capturedGameName.slice(0, 20)}" | ${cacheStatus} | total: ${totalTime.toFixed(0)}ms (fetch: ${fetchTime.toFixed(0)}ms, copy: ${scheduled}) | in-flight: ${inFlight}, queue: ${this.loadQueue.length}`)
            
            // Record timing sample for diagnostics (copyTime tracked separately in scheduler callback)
            this.recordTimingSample({
                gameIndex: entry.gameIndex,
                gameName: entry.gameName,
                fetchTime,
                processTime,
                copyTime: 0,  // Now measured in scheduler callback
                totalTime,
                timestamp: window.performance.now(),
                pixelCacheHit
            })
            
            return true
            
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            HighTextureCache.logger.debug(`Failed to load HIGH texture "${entry.gameName}": ${msg}`)
            entry.state = HighTextureState.FAILED
            // Free the slot since we failed
            if (entry.highSlot >= 0) {
                this.slotAllocator.clearSlot(entry.highSlot)
                this.slotToGame = this.slotAllocator.getSnapshot().slotToGame
                entry.highSlot = -1
            }
            return false
        }
    }
    
    /**
     * Mark a specific game for eviction (e.g., player moved away)
     * This is a hint - the texture will be evicted when space is needed
     */
    public markForEviction(gameIndex: number): void {
        const entry = this.games.get(gameIndex)
        if (entry?.state !== HighTextureState.LOADED) {
            return
        }
        
        // Set access time to 0 so it's evicted first
        entry.lastAccessTime = 0
        HighTextureCache.logger.debug(`Marked for eviction: game ${gameIndex} slot ${entry.highSlot} "${entry.gameName.slice(0, 20)}"`)
    }
    
    private getUsedSlotCount(): number {
        return this.slotAllocator.getUsedSlotCount()
    }
    
    /**
     * Estimate memory usage in MB
     */
    private estimateMemoryMB(): number {
        const bytesPerTexture = this.config.textureWidth * this.config.textureHeight * 4
        return (this.config.totalSlots * bytesPerTexture) / (1024 * 1024)
    }
    
    /**
     * Get cache statistics
     */
    public getStats(): HighTextureCacheStats {
        let loaded = 0, loading = 0, failed = 0, empty = 0, caching = 0, permanentFailures = 0
        
        for (const entry of this.games.values()) {
            switch (entry.state) {
                case HighTextureState.LOADED: loaded++; break
                case HighTextureState.LOADING: loading++; break
                case HighTextureState.FAILED: failed++; break
                case HighTextureState.EMPTY: empty++; break
                case HighTextureState.CACHING: caching++; break
                case HighTextureState.PERMANENT_FAILURE: permanentFailures++; break
            }
        }
        
        return {
            loaded,
            loading,
            failed,
            empty,
            caching,
            permanentFailures,
            backgroundCacheQueue: this.backgroundCachingGames.size,
            totalSlots: this.config.totalSlots,
            usedSlots: this.getUsedSlotCount(),
            queueLength: this.loadQueue.length,
            activeLoads: this.loadingPromises.size,
            ...this.stats
        }
    }

    /**
     * Log cache statistics
     */
    public logStats(): void {
        const stats = this.getStats()
        HighTextureCache.logger.info(`HIGH Texture Cache: ${stats.loaded}/${stats.totalSlots} loaded, ${stats.loading} loading, ${stats.failed} failed, ${stats.evictions} evictions, ${stats.cacheHits}/${stats.cacheHits + stats.cacheMisses} cache hits`)
    }

    // ========================================================================
    // Protected getters for debug class access
    // ========================================================================

    protected getGames(): Map<number, GameEntry> {
        return this.games
    }

    protected getSlotToGame(): number[] {
        return this.slotToGame
    }

    protected getLoadQueue(): number[] {
        return this.loadQueue
    }

    protected getLoadingPromises(): Map<number, Promise<boolean>> {
        return this.loadingPromises
    }

    protected getConfig(): HighTextureCacheConfig {
        return this.config
    }

    protected getInternalStats(): typeof this.stats {
        return this.stats
    }

    protected getDataArrayTexture(): THREE.DataArrayTexture {
        return this.managedArray!.texture
    }

    protected getTimingSamples(): typeof this.timingSamples {
        return this.timingSamples
    }

    protected getMaxTimingSamples(): number {
        return this.MAX_TIMING_SAMPLES
    }

    protected getProfilingSamples(): typeof this.profilingSamples {
        return this.profilingSamples
    }

    protected isProfilingEnabled(): boolean {
        return this.profilingEnabled
    }

    protected setProfilingEnabled(enabled: boolean): void {
        this.profilingEnabled = enabled
    }

    protected clearProfilingSamples(): void {
        this.profilingSamples = []
    }

    protected clearTimingSamplesInternal(): void {
        this.timingSamples = []
    }

    /**
     * Evict all currently loaded HIGH textures, freeing all slots.
     * Called when the app loses focus for an extended period to release GPU memory.
     * Games will reload from pixel cache (fast) or network (slow) on next request.
     */
    public evictAll(): number {
        let evictedCount = 0
        for (const entry of this.games.values()) {
            if (entry.state === HighTextureState.LOADED && entry.highSlot >= 0) {
                this.slotAllocator.clearSlot(entry.highSlot)
                entry.state = HighTextureState.EMPTY
                entry.highSlot = -1
                this.stats.evictions++
                evictedCount++
                if (this.onSlotChange) {
                    this.onSlotChange(entry.gameIndex, -1)
                }
            }
        }
        // Cancel any pending loads — no point loading while unfocused
        this.loadQueue = []
        this.slotToGame = this.slotAllocator.getSnapshot().slotToGame
        if (evictedCount > 0) {
            HighTextureCache.logger.info(`evictAll: released ${evictedCount} HIGH texture slots`)
        }
        return evictedCount
    }

    /**
     * Force-evict a specific game's HIGH texture
     */
    public evictGame(gameIndex: number): boolean {
        const entry = this.games.get(gameIndex)
        if (!entry || entry.highSlot < 0) {
            return false
        }
        
        const freedSlot = entry.highSlot
        this.slotAllocator.clearSlot(freedSlot)
        entry.state = HighTextureState.EMPTY
        entry.highSlot = -1
        this.stats.evictions++
        
        if (this.onSlotChange) {
            this.onSlotChange(entry.gameIndex, -1)
        }
        this.slotToGame = this.slotAllocator.getSnapshot().slotToGame

        return true
    }

    public dispose(): void {
        this.games.clear()
        this.loadingPromises.clear()
        this.loadQueue = []
        this.slotAllocator.clearAll()
        this.slotToGame = this.slotAllocator.getSnapshot().slotToGame
        this.textureWorker.dispose()
        HighTextureCache.logger.lifecycle('Disposed')
    }
    
    private recordTimingSample(sample: {
        gameIndex: number
        gameName: string
        fetchTime: number
        processTime: number
        copyTime: number
        totalTime: number
        timestamp: number
        pixelCacheHit: boolean
    }): void {
        this.timingSamples.push(sample)
        if (this.timingSamples.length > this.MAX_TIMING_SAMPLES) {
            this.timingSamples.shift()
        }
    }
    
    private recordProfilingSample(sample: {
        gameIndex: number
        gameName: string
        workerRoundTrip: number
        arrayBufferCopy: number
        textureArrayCopy: number
        callbackTime: number
        totalMainThread: number
        pixelCacheHit: boolean
        timestamp: number
    }): void {
        this.profilingSamples.push(sample)
        if (this.profilingSamples.length > this.MAX_PROFILING_SAMPLES) {
            this.profilingSamples.shift()
        }
    }
}
