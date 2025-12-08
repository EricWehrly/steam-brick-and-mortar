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

const log = Logger.withContext('HighTextureCache')

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
    /** Loading failed - will retry on next request */
    FAILED = 'failed'
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
    private readonly config: HighTextureCacheConfig
    private readonly textureWorker: TextureWorker
    private readonly pixelCache: PixelDataCache
    
    /** The GPU texture array (reference - owned by LodArtworkRenderer) */
    private dataArrayTexture: THREE.DataArrayTexture | null = null
    
    /** Dirty flag: texture data changed, needs GPU upload */
    private isDirty: boolean = false
    
    /** Game entries by game index */
    private games: Map<number, GameEntry> = new Map()
    
    /** Slot allocation: slot index → game index (or -1 if free) */
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
    
    constructor(config: Partial<HighTextureCacheConfig> = {}) {
        this.config = {
            totalSlots: config.totalSlots ?? 64,
            textureWidth: config.textureWidth ?? 600,
            textureHeight: config.textureHeight ?? 900,
            maxConcurrentLoads: config.maxConcurrentLoads ?? 2
        }
        
        // Initialize slot allocation array - all slots start free (-1)
        this.slotToGame = new Array(this.config.totalSlots).fill(-1)
        
        this.textureWorker = new TextureWorker()
        this.pixelCache = PixelDataCache.getInstance()
        
        log.lifecycle(`Initialized: ${this.config.totalSlots} slots, ${this.config.maxConcurrentLoads} concurrent loads (${this.estimateMemoryMB()}MB)`)
    }
    
    /**
     * Set callback for slot changes (called by LodArtworkRenderer)
     */
    public setSlotChangeCallback(callback: SlotChangeCallback): void {
        this.onSlotChange = callback
    }
    
    /**
     * Set the GPU texture array reference (called by LodArtworkRenderer during init)
     */
    public setTextureArray(texture: THREE.DataArrayTexture): void {
        this.dataArrayTexture = texture
        log.lifecycle('Texture array reference set')
    }
    
    /**
     * Check if texture data has changed and needs GPU upload
     */
    public needsGpuUpdate(): boolean {
        return this.isDirty
    }
    
    /**
     * Flush dirty texture data to GPU
     * Call this periodically (e.g., every N frames) instead of on every texture load
     * Returns true if an update was performed
     */
    public flushToGpu(): boolean {
        if (!this.isDirty || !this.dataArrayTexture) {
            return false
        }
        
        this.dataArrayTexture.needsUpdate = true
        this.isDirty = false
        return true
    }
    
    /**
     * Register a game (called when a game is added)
     * Does NOT load the HIGH texture - just records that the game exists
     */
    public registerGame(gameIndex: number, gameName: string, artworkUrl: string): void {
        if (this.games.has(gameIndex)) {
            return // Already registered
        }
        
        this.games.set(gameIndex, {
            gameIndex,
            gameName,
            artworkUrl,
            state: HighTextureState.EMPTY,
            highSlot: -1,
            lastAccessTime: 0,
            loadAttempts: 0
        })
    }
    
    /**
     * Request HIGH texture for a game
     * Returns the HIGH slot if loaded, otherwise triggers async load and returns -1
     * @returns HIGH slot (0-63) if ready, -1 if loading or unavailable
     */
    public requestHighTexture(gameIndex: number): number {
        const entry = this.games.get(gameIndex)
        if (!entry) {
            log.warn(`requestHighTexture: unknown game ${gameIndex}`)
            return -1
        }
        
        // Update access time for LRU
        entry.lastAccessTime = window.performance.now()
        
        switch (entry.state) {
            case HighTextureState.LOADED:
                this.stats.cacheHits++
                log.debug(`REQUEST game ${gameIndex} "${entry.gameName.slice(0, 15)}" → HIT slot ${entry.highSlot}`)
                return entry.highSlot
                
            case HighTextureState.LOADING:
                // Already loading - return -1, caller should use MID for now
                log.debug(`REQUEST game ${gameIndex} "${entry.gameName.slice(0, 15)}" → LOADING (wait)`)
                return -1
                
            case HighTextureState.CACHING:
                // Background caching in progress - check if cache is now ready
                if (this.backgroundCachingGames.has(gameIndex)) {
                    // Still caching, stay on MID
                    log.debug(`REQUEST game ${gameIndex} "${entry.gameName.slice(0, 15)}" → CACHING (wait)`)
                    return -1
                }
                // Background caching finished - transition to EMPTY so next request loads from cache
                entry.state = HighTextureState.EMPTY
                // Now trigger load which will hit pixel cache (fast path)
                this.stats.cacheMisses++
                log.debug(`REQUEST game ${gameIndex} "${entry.gameName.slice(0, 15)}" → CACHE READY (triggering fast load)`)
                this.triggerLoad(entry)
                return -1
                
            case HighTextureState.EMPTY:
            case HighTextureState.FAILED:
                // Need to load - trigger async load
                this.stats.cacheMisses++
                log.debug(`REQUEST game ${gameIndex} "${entry.gameName.slice(0, 15)}" → MISS (triggering load)`)
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
            log.debug(`TRIGGER game ${entry.gameIndex} → already loading, skip`)
            return
        }
        if (this.loadQueue.includes(entry.gameIndex)) {
            log.debug(`TRIGGER game ${entry.gameIndex} → already queued at position ${this.loadQueue.indexOf(entry.gameIndex)}`)
            return
        }
        
        // Check if we're at the concurrent load limit
        if (this.loadingPromises.size >= this.config.maxConcurrentLoads) {
            // Queue for later
            this.loadQueue.push(entry.gameIndex)
            log.debug(`TRIGGER game ${entry.gameIndex} "${entry.gameName.slice(0, 15)}" → QUEUED (pos ${this.loadQueue.length}, active: ${this.loadingPromises.size})`)
            return
        }
        
        log.debug(`TRIGGER game ${entry.gameIndex} "${entry.gameName.slice(0, 15)}" → starting load`)
        this.startLoad(entry)
    }
    
    /**
     * Actually start loading a texture (called when under concurrent limit)
     */
    private startLoad(entry: GameEntry): void {
        // Allocate a slot (may evict if full)
        const slot = this.allocateSlot(entry.gameIndex)
        if (slot < 0) {
            log.warn(`Cannot load HIGH texture ${entry.gameIndex}: no slots available`)
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
        // First, try to find a free slot
        for (let slot = 0; slot < this.config.totalSlots; slot++) {
            if (this.slotToGame[slot] === -1) {
                this.slotToGame[slot] = gameIndex
                return slot
            }
        }
        
        // All slots full - evict LRU
        const evictedSlot = this.evictLru()
        if (evictedSlot >= 0) {
            this.slotToGame[evictedSlot] = gameIndex
            return evictedSlot
        }
        
        return -1 // Should not happen
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
        log.debug(`BACKGROUND CACHE START ${entry.gameIndex} "${entry.gameName.slice(0, 15)}"`)
        
        // Fire and forget - fetch, decode, and store in pixel cache
        this.textureWorker.fetchAndProcessWithOptions(
            entry.artworkUrl,
            entry.gameIndex,
            entry.gameName,
            {
                useNativeSize: true,
                timeout: 15000
            }
        ).then(async (result) => {
            // Verify dimensions
            if (result.width !== this.config.textureWidth || result.height !== this.config.textureHeight) {
                log.warn(`BACKGROUND CACHE: size mismatch for "${entry.gameName}": expected ${this.config.textureWidth}×${this.config.textureHeight}, got ${result.width}×${result.height}`)
                entry.state = HighTextureState.FAILED
                this.backgroundCachingGames.delete(entry.gameIndex)
                return
            }
            
            // Store in pixel cache
            await this.pixelCache.put(entry.artworkUrl, result.imageData, result.width, result.height)
            
            log.debug(`BACKGROUND CACHE COMPLETE ${entry.gameIndex} "${entry.gameName.slice(0, 15)}" (${result.width}×${result.height})`)
            this.backgroundCachingGames.delete(entry.gameIndex)
            // Entry stays in CACHING state - next requestHighTexture() will detect cache ready
        }).catch((err) => {
            const msg = err instanceof Error ? err.message : String(err)
            log.debug(`BACKGROUND CACHE FAILED ${entry.gameIndex} "${entry.gameName.slice(0, 15)}": ${msg}`)
            entry.state = HighTextureState.FAILED
            this.backgroundCachingGames.delete(entry.gameIndex)
        })
    }

    /**
     * Actually load a HIGH texture - first checks pixel cache, defers to background on miss
     */
    private async loadHighTexture(entry: GameEntry): Promise<boolean> {
        if (!this.dataArrayTexture) {
            log.warn('Cannot load HIGH texture: texture array not set')
            entry.state = HighTextureState.FAILED
            return false
        }
        
        if (entry.highSlot < 0) {
            log.warn('Cannot load HIGH texture: no slot assigned')
            entry.state = HighTextureState.FAILED
            return false
        }
        
        const loadStart = window.performance.now()
        
        try {
            log.debug(`START HIGH ${entry.gameIndex} → slot ${entry.highSlot} "${entry.gameName.slice(0, 20)}" | in-flight: ${this.loadingPromises.size}/${this.config.maxConcurrentLoads}, queue: ${this.loadQueue.length}`)
            
            // First, check the pixel cache for decoded RGBA data
            const fetchStart = window.performance.now()
            const cachedPixels = await this.pixelCache.get(entry.artworkUrl)
            
            let imageData: Uint8ClampedArray
            let processTime = 0
            let pixelCacheHit = false
            
            if (cachedPixels) {
                // Pixel cache HIT - use cached decoded data directly (skip decode)
                this.stats.pixelCacheHits++
                pixelCacheHit = true
                imageData = cachedPixels.pixelData
                processTime = 0 // No decode needed
                log.debug(`PIXEL CACHE HIT ${entry.gameIndex} "${entry.gameName.slice(0, 15)}" (${cachedPixels.width}×${cachedPixels.height})`)
            } else {
                // Pixel cache MISS - defer to background caching to avoid main thread lag
                // Release the slot and set CACHING state so we don't block
                this.stats.pixelCacheMisses++
                log.debug(`PIXEL CACHE MISS ${entry.gameIndex} "${entry.gameName.slice(0, 15)}" → deferring to background caching`)
                
                // Release the allocated slot
                if (entry.highSlot >= 0) {
                    this.slotToGame[entry.highSlot] = -1
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
                log.warn(`HIGH texture data size mismatch for "${entry.gameName}": expected ${expectedSize}, got ${imageData.length}`)
                entry.state = HighTextureState.FAILED
                return false
            }
            
            // Copy to texture array at the assigned SLOT (not gameIndex!)
            const copyStart = window.performance.now()
            const sliceSize = this.config.textureWidth * this.config.textureHeight * 4
            const offset = entry.highSlot * sliceSize
            const arrayData = this.dataArrayTexture.image.data as Uint8Array
            arrayData.set(imageData, offset)
            const copyTime = window.performance.now() - copyStart
            
            // Mark dirty - caller should call flushToGpu() periodically
            this.isDirty = true
            
            entry.state = HighTextureState.LOADED
            entry.lastAccessTime = window.performance.now()
            
            // Notify callback so renderer can update highTextureSlot attribute
            if (this.onSlotChange) {
                this.onSlotChange(entry.gameIndex, entry.highSlot)
            }
            
            const totalTime = window.performance.now() - loadStart
            const inFlight = this.loadingPromises.size - 1  // -1 because this one is about to complete
            const cacheStatus = pixelCacheHit ? '🟢 PIXEL HIT' : '🔴 PIXEL MISS'
            log.debug(`COMPLETE HIGH ${entry.gameIndex} → slot ${entry.highSlot} "${entry.gameName.slice(0, 20)}" | ${cacheStatus} | total: ${totalTime.toFixed(0)}ms (fetch: ${fetchTime.toFixed(0)}ms, process: ${processTime.toFixed(0)}ms, copy: ${copyTime.toFixed(1)}ms) | in-flight: ${inFlight}, queue: ${this.loadQueue.length}`)
            
            // Record timing sample for diagnostics
            this.recordTimingSample({
                gameIndex: entry.gameIndex,
                gameName: entry.gameName,
                fetchTime,
                processTime,
                copyTime,
                totalTime,
                timestamp: window.performance.now(),
                pixelCacheHit
            })
            
            return true
            
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            log.debug(`Failed to load HIGH texture "${entry.gameName}": ${msg}`)
            entry.state = HighTextureState.FAILED
            // Free the slot since we failed
            if (entry.highSlot >= 0) {
                this.slotToGame[entry.highSlot] = -1
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
        if (!entry || entry.state !== HighTextureState.LOADED) {
            return
        }
        
        // Set access time to 0 so it's evicted first
        entry.lastAccessTime = 0
        log.debug(`Marked for eviction: game ${gameIndex} slot ${entry.highSlot} "${entry.gameName.slice(0, 20)}"`)
    }
    
    /**
     * Evict the least-recently-used loaded HIGH texture
     * @returns the freed slot index, or -1 if nothing to evict
     */
    private evictLru(): number {
        let lruEntry: GameEntry | null = null
        let lruTime = Infinity
        
        for (const entry of this.games.values()) {
            if (entry.state === HighTextureState.LOADED && entry.lastAccessTime < lruTime) {
                lruTime = entry.lastAccessTime
                lruEntry = entry
            }
        }
        
        if (!lruEntry || lruEntry.highSlot < 0) {
            return -1
        }
        
        const freedSlot = lruEntry.highSlot
        
        // Clear the slot assignment
        this.slotToGame[freedSlot] = -1
        
        // Reset entry state
        lruEntry.state = HighTextureState.EMPTY
        lruEntry.highSlot = -1
        this.stats.evictions++
        
        // Notify callback so renderer can update highTextureSlot attribute to -1
        if (this.onSlotChange) {
            this.onSlotChange(lruEntry.gameIndex, -1)
        }
        
        log.runtime(`Evicted game ${lruEntry.gameIndex} from slot ${freedSlot} "${lruEntry.gameName.slice(0, 20)}"`)
        return freedSlot
    }
    
    /**
     * Count used slots
     */
    private getUsedSlotCount(): number {
        return this.slotToGame.filter(g => g >= 0).length
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
        let loaded = 0, loading = 0, failed = 0, empty = 0, caching = 0
        
        for (const entry of this.games.values()) {
            switch (entry.state) {
                case HighTextureState.LOADED: loaded++; break
                case HighTextureState.LOADING: loading++; break
                case HighTextureState.FAILED: failed++; break
                case HighTextureState.EMPTY: empty++; break
                case HighTextureState.CACHING: caching++; break
            }
        }
        
        return {
            loaded,
            loading,
            failed,
            empty,
            caching,
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
        log.info(`HIGH Texture Cache: ${stats.loaded}/${stats.totalSlots} loaded, ${stats.loading} loading, ${stats.failed} failed, ${stats.evictions} evictions, ${stats.cacheHits}/${stats.cacheHits + stats.cacheMisses} cache hits`)
    }

    /**
     * EXPERIMENT: Load N textures with different concurrency limits
     * Run from console: window.experimentLoadingStrategies()
     * 
     * Tests:
     * - Single load (max 1 concurrent)
     * - Throttled load (max 2 concurrent) 
     * - Batch load (max N concurrent)
     * 
     * Measures frame time impact during loading
     */
    public async experimentLoadingStrategies(
        gameIndices: number[],
        strategies: { name: string; maxConcurrent: number }[] = [
            { name: 'single', maxConcurrent: 1 },
            { name: 'throttled', maxConcurrent: 2 },
            { name: 'batch', maxConcurrent: 8 }
        ]
    ): Promise<void> {
        console.group('🧪 Loading Strategy Experiment')
        console.log(`Testing ${gameIndices.length} textures with ${strategies.length} strategies`)
        
        const results: { name: string; totalTime: number; avgFrameImpact: string }[] = []
        
        for (const strategy of strategies) {
            // Reset - evict all textures first
            for (const gameIndex of gameIndices) {
                const entry = this.games.get(gameIndex)
                if (entry && entry.state === HighTextureState.LOADED) {
                    this.evictGame(gameIndex)
                }
            }
            
            // Save original config
            const originalMaxConcurrent = this.config.maxConcurrentLoads
            this.config.maxConcurrentLoads = strategy.maxConcurrent
            
            // Track frame times during load
            const frameTimeSamples: number[] = []
            let lastFrameTime = window.performance.now()
            const frameTracker = (): void => {
                const now = window.performance.now()
                frameTimeSamples.push(now - lastFrameTime)
                lastFrameTime = now
                if (this.loadingPromises.size > 0 || this.loadQueue.length > 0) {
                    window.requestAnimationFrame(frameTracker)
                }
            }
            window.requestAnimationFrame(frameTracker)
            
            // Start loading
            const loadStart = window.performance.now()
            
            // Queue all textures
            for (const gameIndex of gameIndices) {
                this.requestHighTexture(gameIndex)
            }
            
            // Wait for all to complete
            while (this.loadingPromises.size > 0 || this.loadQueue.length > 0) {
                await new Promise(resolve => setTimeout(resolve, 50))
            }
            
            const totalTime = window.performance.now() - loadStart
            
            // Analyze frame impact
            const avgFrame = frameTimeSamples.length > 0 
                ? frameTimeSamples.reduce((a, b) => a + b, 0) / frameTimeSamples.length
                : 0
            const maxFrame = frameTimeSamples.length > 0 
                ? Math.max(...frameTimeSamples)
                : 0
            
            results.push({
                name: strategy.name,
                totalTime,
                avgFrameImpact: `avg: ${avgFrame.toFixed(1)}ms, max: ${maxFrame.toFixed(1)}ms (${frameTimeSamples.length} samples)`
            })
            
            console.log(`\n📊 ${strategy.name.toUpperCase()} (max ${strategy.maxConcurrent} concurrent):`)
            console.log(`   Total time: ${totalTime.toFixed(0)}ms`)
            console.log(`   Frame impact: ${results[results.length - 1].avgFrameImpact}`)
            
            // Restore config
            this.config.maxConcurrentLoads = originalMaxConcurrent
        }
        
        console.log('\n📈 SUMMARY:')
        console.table(results)
        console.groupEnd()
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
        this.slotToGame[freedSlot] = -1
        entry.state = HighTextureState.EMPTY
        entry.highSlot = -1
        this.stats.evictions++
        
        if (this.onSlotChange) {
            this.onSlotChange(entry.gameIndex, -1)
        }
        
        return true
    }

    /**
     * Diagnostic: Measure the cost of various operations
     * Call from console: window.measureTextureCosts()
     */
    public measureOperationCosts(): void {
        if (!this.dataArrayTexture) {
            console.log('❌ No texture array available')
            return
        }
        
        const width = this.config.textureWidth
        const height = this.config.textureHeight
        const sliceBytes = width * height * 4
        const totalBytes = sliceBytes * this.config.totalSlots
        
        console.group('🔬 HIGH Texture Cache Operation Costs')
        console.log(`Texture array: ${width}×${height}×${this.config.totalSlots} = ${(totalBytes / 1024 / 1024).toFixed(1)}MB`)
        
        // Test 1: CPU array copy (single slice)
        const testData = new Uint8Array(sliceBytes)
        const arrayData = this.dataArrayTexture.image.data as Uint8Array
        
        const copyStart = window.performance.now()
        for (let i = 0; i < 10; i++) {
            arrayData.set(testData, 0)
        }
        const copyTime = (window.performance.now() - copyStart) / 10
        console.log(`CPU copy (${(sliceBytes / 1024).toFixed(0)}KB): ${copyTime.toFixed(2)}ms per slice`)
        
        // Test 2: Setting needsUpdate (doesn't do GPU upload, just flags)
        const flagStart = window.performance.now()
        for (let i = 0; i < 100; i++) {
            this.dataArrayTexture.needsUpdate = true
        }
        const flagTime = (window.performance.now() - flagStart) / 100
        console.log(`needsUpdate flag: ${flagTime.toFixed(4)}ms (negligible)`)
        
        // Note about GPU upload
        console.log(`⚠️ GPU upload happens on render - can't measure directly here`)
        console.log(`   The upload transfers the ENTIRE ${(totalBytes / 1024 / 1024).toFixed(1)}MB array to GPU`)
        console.log(`   This is the likely source of lag spikes`)
        
        console.log('\n📊 Current stats:', this.getStats())
        console.groupEnd()
    }

    public dispose(): void {
        this.games.clear()
        this.loadingPromises.clear()
        this.loadQueue = []
        this.slotToGame = []
        this.textureWorker.dispose()
        log.lifecycle('Disposed')
    }

    /**
     * Diagnostic: Get detailed state for games around a specific index
     * Useful for debugging index mapping issues
     */
    public diagnoseIndexCluster(centerIndex: number, radius: number = 3): void {
        console.group(`🔍 Index Cluster Diagnosis: ${centerIndex} ± ${radius}`)
        
        const start = Math.max(0, centerIndex - radius)
        const end = centerIndex + radius
        
        console.log('\nGame entries:')
        for (let i = start; i <= end; i++) {
            const entry = this.games.get(i)
            if (entry) {
                const slotInfo = entry.highSlot >= 0 ? `slot ${entry.highSlot}` : 'no slot'
                console.log(`  [${i}] "${entry.gameName.slice(0, 25)}" | state: ${entry.state} | ${slotInfo} | lastAccess: ${entry.lastAccessTime > 0 ? `${((Date.now() - entry.lastAccessTime) / 1000).toFixed(1)}s ago` : 'never'}`)
            } else {
                console.log(`  [${i}] NOT REGISTERED`)
            }
        }
        
        console.log('\nSlot → Game mapping (occupied slots):')
        const occupiedSlots: string[] = []
        for (let slot = 0; slot < this.config.totalSlots; slot++) {
            const gameIdx = this.slotToGame[slot]
            if (gameIdx >= start && gameIdx <= end) {
                const entry = this.games.get(gameIdx)
                occupiedSlots.push(`  slot ${slot} → game ${gameIdx} "${entry?.gameName.slice(0, 20) ?? '?'}"`)
            }
        }
        if (occupiedSlots.length > 0) {
            occupiedSlots.forEach(s => console.log(s))
        } else {
            console.log('  (no games in this range have slots)')
        }
        
        console.log('\nQueue state:')
        const queuedInRange = this.loadQueue.filter(idx => idx >= start && idx <= end)
        if (queuedInRange.length > 0) {
            console.log(`  Queued: ${queuedInRange.join(', ')}`)
        } else {
            console.log('  (no games in this range are queued)')
        }
        
        const loadingInRange = Array.from(this.loadingPromises.keys()).filter(idx => idx >= start && idx <= end)
        if (loadingInRange.length > 0) {
            console.log(`  Loading: ${loadingInRange.join(', ')}`)
        } else {
            console.log('  (no games in this range are loading)')
        }
        
        console.groupEnd()
    }

    /**
     * Diagnostic: Compare all index tracking locations
     * Returns games where there's a mismatch between tracked locations
     */
    public diagnoseIndexMismatches(): { gameIndex: number; issues: string[] }[] {
        const mismatches: { gameIndex: number; issues: string[] }[] = []
        
        for (const [gameIndex, entry] of this.games) {
            const issues: string[] = []
            
            // Check 1: If entry says it has a slot, does slotToGame agree?
            if (entry.highSlot >= 0) {
                const slotOwner = this.slotToGame[entry.highSlot]
                if (slotOwner !== gameIndex) {
                    issues.push(`entry.highSlot=${entry.highSlot} but slotToGame[${entry.highSlot}]=${slotOwner}`)
                }
            }
            
            // Check 2: If entry is LOADED, does it have a valid slot?
            if (entry.state === HighTextureState.LOADED && entry.highSlot < 0) {
                issues.push(`state=LOADED but highSlot=${entry.highSlot}`)
            }
            
            // Check 3: If entry is EMPTY, it shouldn't have a slot
            if (entry.state === HighTextureState.EMPTY && entry.highSlot >= 0) {
                issues.push(`state=EMPTY but highSlot=${entry.highSlot}`)
            }
            
            if (issues.length > 0) {
                mismatches.push({ gameIndex, issues })
            }
        }
        
        // Check reverse: slots that point to games that don't acknowledge them
        for (let slot = 0; slot < this.config.totalSlots; slot++) {
            const gameIndex = this.slotToGame[slot]
            if (gameIndex >= 0) {
                const entry = this.games.get(gameIndex)
                if (!entry) {
                    mismatches.push({ gameIndex, issues: [`slot ${slot} points to game ${gameIndex} but game not registered`] })
                } else if (entry.highSlot !== slot) {
                    // Already caught above, but note it
                }
            }
        }
        
        if (mismatches.length === 0) {
            console.log('✅ No index mismatches found')
        } else {
            console.group(`❌ Found ${mismatches.length} index mismatches`)
            for (const m of mismatches) {
                console.log(`  Game ${m.gameIndex}: ${m.issues.join(', ')}`)
            }
            console.groupEnd()
        }
        
        return mismatches
    }

    /**
     * Diagnostic: Show queue and loading state
     */
    public diagnoseLoadState(): void {
        console.group('📦 Load State Diagnosis')
        
        console.log(`Active loads: ${this.loadingPromises.size}/${this.config.maxConcurrentLoads}`)
        if (this.loadingPromises.size > 0) {
            const loading = Array.from(this.loadingPromises.keys())
            loading.forEach(idx => {
                const entry = this.games.get(idx)
                console.log(`  Loading: game ${idx} "${entry?.gameName.slice(0, 20) ?? '?'}"`)
            })
        }
        
        console.log(`\nQueue length: ${this.loadQueue.length}`)
        if (this.loadQueue.length > 0) {
            const first5 = this.loadQueue.slice(0, 5)
            first5.forEach((idx, pos) => {
                const entry = this.games.get(idx)
                console.log(`  [${pos}] game ${idx} "${entry?.gameName.slice(0, 20) ?? '?'}"`)
            })
            if (this.loadQueue.length > 5) {
                console.log(`  ... and ${this.loadQueue.length - 5} more`)
            }
        }
        
        console.log(`\nSlot usage: ${this.getUsedSlotCount()}/${this.config.totalSlots}`)
        console.log(`Stats: ${this.stats.cacheHits} hits, ${this.stats.cacheMisses} misses, ${this.stats.evictions} evictions`)
        
        console.groupEnd()
    }

    /**
     * Diagnostic: Dump full index→game mapping for first N entries
     */
    public dumpIndexMapping(count: number = 50): void {
        console.group(`📋 Index → Game Mapping (first ${count})`)
        
        const entries = Array.from(this.games.entries())
            .sort((a, b) => a[0] - b[0])
            .slice(0, count)
        
        console.log('Index | State   | Slot | Game Name')
        console.log('------|---------|------|----------')
        for (const [idx, entry] of entries) {
            const slot = entry.highSlot >= 0 ? String(entry.highSlot).padStart(4) : '  - '
            const state = entry.state.padEnd(7)
            console.log(`${String(idx).padStart(5)} | ${state} | ${slot} | ${entry.gameName}`)
        }
        
        console.groupEnd()
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
        // Keep circular buffer at max size
        if (this.timingSamples.length > this.MAX_TIMING_SAMPLES) {
            this.timingSamples.shift()
        }
    }
    
    public diagnoseTimings(): void {
        console.group('⏱️ HIGH Texture Load Timing Statistics')
        
        if (this.timingSamples.length === 0) {
            console.log('No timing samples recorded yet.')
            console.groupEnd()
            return
        }
        
        const count = this.timingSamples.length
        const pixelHits = this.timingSamples.filter(s => s.pixelCacheHit)
        const pixelMisses = this.timingSamples.filter(s => !s.pixelCacheHit)
        
        // Calculate averages
        const avgFetch = this.timingSamples.reduce((sum, s) => sum + s.fetchTime, 0) / count
        const avgProcess = this.timingSamples.reduce((sum, s) => sum + s.processTime, 0) / count
        const avgCopy = this.timingSamples.reduce((sum, s) => sum + s.copyTime, 0) / count
        const avgTotal = this.timingSamples.reduce((sum, s) => sum + s.totalTime, 0) / count
        
        // Calculate min/max
        const minTotal = Math.min(...this.timingSamples.map(s => s.totalTime))
        const maxTotal = Math.max(...this.timingSamples.map(s => s.totalTime))
        
        // Calculate percentiles (p50, p90, p99)
        const sorted = [...this.timingSamples].sort((a, b) => a.totalTime - b.totalTime)
        const p50 = sorted[Math.floor(count * 0.5)]?.totalTime ?? 0
        const p90 = sorted[Math.floor(count * 0.9)]?.totalTime ?? 0
        const p99 = sorted[Math.floor(count * 0.99)]?.totalTime ?? 0
        
        console.log(`Samples: ${count} (max ${this.MAX_TIMING_SAMPLES})`)
        console.log('')
        
        // Show pixel cache breakdown
        const hitPercent = count > 0 ? ((pixelHits.length / count) * 100).toFixed(1) : '0'
        console.log('--- Pixel Cache ---')
        console.log(`  🟢 Hits:   ${pixelHits.length} (${hitPercent}%)`)
        console.log(`  🔴 Misses: ${pixelMisses.length}`)
        if (pixelHits.length > 0) {
            const avgHitTime = pixelHits.reduce((sum, s) => sum + s.totalTime, 0) / pixelHits.length
            console.log(`  Avg HIT time:  ${avgHitTime.toFixed(1)}ms (skips decode!)`)
        }
        if (pixelMisses.length > 0) {
            const avgMissTime = pixelMisses.reduce((sum, s) => sum + s.totalTime, 0) / pixelMisses.length
            console.log(`  Avg MISS time: ${avgMissTime.toFixed(1)}ms (includes decode)`)
        }
        console.log('')
        
        console.log('--- Average Breakdown (all) ---')
        console.log(`  Fetch (network):  ${avgFetch.toFixed(1)}ms`)
        console.log(`  Process (decode): ${avgProcess.toFixed(1)}ms`)
        console.log(`  Copy (to array):  ${avgCopy.toFixed(2)}ms`)
        console.log(`  TOTAL:            ${avgTotal.toFixed(1)}ms`)
        console.log('')
        console.log('--- Distribution (total time) ---')
        console.log(`  Min:  ${minTotal.toFixed(0)}ms`)
        console.log(`  P50:  ${p50.toFixed(0)}ms`)
        console.log(`  P90:  ${p90.toFixed(0)}ms`)
        console.log(`  P99:  ${p99.toFixed(0)}ms`)
        console.log(`  Max:  ${maxTotal.toFixed(0)}ms`)
        
        // Show slowest 5 loads
        console.log('')
        console.log('--- Slowest 5 Loads ---')
        const slowest = [...this.timingSamples]
            .sort((a, b) => b.totalTime - a.totalTime)
            .slice(0, 5)
        slowest.forEach((s, i) => {
            const cacheIcon = s.pixelCacheHit ? '🟢' : '🔴'
            console.log(`  ${i + 1}. ${cacheIcon} ${s.totalTime.toFixed(0)}ms - "${s.gameName.slice(0, 25)}" (fetch: ${s.fetchTime.toFixed(0)}ms)`)
        })
        
        // Show most recent 5 loads
        console.log('')
        console.log('--- Most Recent 5 Loads ---')
        const recent = [...this.timingSamples].slice(-5).reverse()
        recent.forEach((s, i) => {
            const cacheIcon = s.pixelCacheHit ? '🟢' : '🔴'
            console.log(`  ${i + 1}. ${cacheIcon} ${s.totalTime.toFixed(0)}ms - "${s.gameName.slice(0, 25)}" (game ${s.gameIndex})`)
        })
        
        console.groupEnd()
    }
    
    public clearTimingSamples(): void {
        this.timingSamples = []
        console.log('Timing samples cleared.')
    }
}
