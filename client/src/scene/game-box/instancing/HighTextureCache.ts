/**
 * HIGH Texture Cache - LRU cache for high-resolution textures.
 *
 * Memory optimization: instead of loading all HIGH textures upfront (~512MB for 512 games),
 * only a limited number stay loaded (~64 textures) and are evicted/reloaded by LRU as games
 * enter and leave HIGH LOD. The shader reads a per-instance highTextureSlot attribute
 * (0..totalSlots-1, or -1 while not loaded) to know which array layer to sample.
 */

import * as THREE from 'three'
import { Logger } from '../../../utils/Logger'
import { UrlUtils } from '../../../utils/UrlUtils'
import { TextureWorker } from './TextureWorker'
import { PixelDataCache } from './PixelDataCache'
import { GameArtworkProvider } from './GameArtworkProvider'
import { AppDetailsCache } from '../../../steam/cache/AppDetailsCache'
import { FrameBudgetScheduler } from '../../../utils/FrameBudgetScheduler'
import { ManagedTextureArray } from './ManagedTextureArray'
import { LOD_TIER_NAME } from './IGameArtworkPipeline'
import { getLodStripeDebugColor, isLodStripeDebugEnabled } from './LodDebugSettings'
import { HighSlotAllocator } from './HighSlotAllocator'

export enum HighTextureState {
    EMPTY = 'empty',
    /** Pixel data is being cached in background (stay on MID) */
    CACHING = 'caching',
    LOADING = 'loading',
    LOADED = 'loaded',
    /** Will retry on next request, up to maxLoadAttempts */
    FAILED = 'failed',
    /** CORS, 404, etc - will never retry */
    PERMANENT_FAILURE = 'permanent_failure'
}

export interface HighTextureCacheConfig {
    totalSlots: number
    textureWidth: number
    textureHeight: number
    /** Throttle on simultaneous in-flight texture loads */
    maxConcurrentLoads: number
    /** Default: 2 */
    maxLoadAttempts?: number
}

/** Fired when a game's HIGH slot assignment changes, including eviction (slot -1) */
export type SlotChangeCallback = (gameIndex: number, slot: number) => void

interface GameEntry {
    /** Texture index in the MID array - shared identity across LOD tiers */
    gameIndex: number
    gameName: string
    /** Needed to check Steam's local librarycache and artwork_dead_paths before any network attempt. */
    appid: number
    /** Only consulted when no local art is available */
    artworkUrl: string
    state: HighTextureState
    /** -1 if not assigned */
    highSlot: number
    /** For LRU eviction */
    lastAccessTime: number
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

    private games: Map<number, GameEntry> = new Map()

    /** Games with a load in flight - distinct from loadQueue (waiting) and backgroundCachingGames (no slot yet) */
    private loadingPromises: Map<number, Promise<boolean>> = new Map()
    private loadQueue: number[] = []

    /** Games being pixel-cache-warmed in the background - no HIGH slot allocated yet */
    private backgroundCachingGames: Set<number> = new Set()

    private onSlotChange: SlotChangeCallback | null = null

    private stats = {
        evictions: 0,
        cacheHits: 0,
        cacheMisses: 0,
        pixelCacheHits: 0,
        pixelCacheMisses: 0
    }

    private readonly scheduler: FrameBudgetScheduler

    constructor(config: Partial<HighTextureCacheConfig> = {}) {
        this.config = {
            totalSlots: config.totalSlots ?? 64,
            textureWidth: config.textureWidth ?? 600,
            textureHeight: config.textureHeight ?? 900,
            maxConcurrentLoads: config.maxConcurrentLoads ?? 2
        }
        
        this.slotAllocator = new HighSlotAllocator(this.config.totalSlots)

        const debugStripe = isLodStripeDebugEnabled() ? getLodStripeDebugColor(LOD_TIER_NAME.HIGH) : undefined
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
    
    public setSlotChangeCallback(callback: SlotChangeCallback): void {
        this.onSlotChange = callback
    }

    public getTexture(): THREE.DataArrayTexture {
        return this.managedArray!.texture
    }

    public needsGpuUpdate(): boolean {
        return this.managedArray!.hasPendingUpdates()
    }

    /** Uploads only dirty layers - never the whole array, see DataArrayTexture note in client/CLAUDE.md */
    public flushToGpu(): boolean {
        const count = this.managedArray!.pendingCount
        if (count === 0) return false
        const flushed = this.managedArray!.flushPendingToGpu()
        if (flushed) {
            HighTextureCache.logger.debug(`GPU flush: ${count} slot(s) → ~${(count * this.config.textureWidth * this.config.textureHeight * 4 / 1024).toFixed(0)}KB upload`)
        }
        return flushed
    }
    
    /** Does NOT load the HIGH texture - just records that the game exists */
    public registerGame(gameIndex: number, gameName: string, appid: number, artworkUrl: string): void {
        if (this.games.has(gameIndex)) {
            return
        }

        this.games.set(gameIndex, {
            gameIndex,
            gameName,
            appid,
            artworkUrl,
            state: HighTextureState.EMPTY,
            highSlot: -1,
            lastAccessTime: 0,
            loadAttempts: 0
        })
    }
    
    /** e.g. CORS error during MID loading - avoids wasting a network request on the same dead artwork */
    public markAsPermanentlyFailed(gameIndex: number, reason?: string): void {
        const entry = this.games.get(gameIndex)
        if (entry) {
            entry.state = HighTextureState.PERMANENT_FAILURE
            HighTextureCache.logger.info(`Game "${entry.gameName}" marked as permanent failure${reason ? `: ${reason}` : ''}`)
        }
    }
    
    public unregisterGame(gameIndex: number): void {
        this.games.delete(gameIndex)
    }

    /** @returns HIGH slot if ready, -1 if loading, queued, or unavailable (triggers an async load as a side effect) */
    public requestHighTexture(gameIndex: number): number {
        const entry = this.games.get(gameIndex)
        if (!entry) {
            HighTextureCache.logger.warn(`requestHighTexture: unknown game ${gameIndex}`)
            return -1
        }

        entry.lastAccessTime = window.performance.now()

        switch (entry.state) {
            case HighTextureState.LOADED:
                this.stats.cacheHits++
                HighTextureCache.logger.debug(`REQUEST game ${gameIndex} "${entry.gameName.slice(0, 15)}" → HIT slot ${entry.highSlot}`)
                return entry.highSlot
                
            case HighTextureState.LOADING:
                HighTextureCache.logger.debug(`REQUEST game ${gameIndex} "${entry.gameName.slice(0, 15)}" → LOADING (wait)`)
                return -1

            case HighTextureState.CACHING:
                if (this.backgroundCachingGames.has(gameIndex)) {
                    HighTextureCache.logger.debug(`REQUEST game ${gameIndex} "${entry.gameName.slice(0, 15)}" → CACHING (wait)`)
                    return -1
                }
                // Background caching finished - EMPTY re-triggers a load, now a pixel-cache fast path.
                entry.state = HighTextureState.EMPTY
                this.stats.cacheMisses++
                HighTextureCache.logger.debug(`REQUEST game ${gameIndex} "${entry.gameName.slice(0, 15)}" → CACHE READY (triggering fast load)`)
                this.triggerLoad(entry)
                return -1

            case HighTextureState.PERMANENT_FAILURE:
                HighTextureCache.logger.debug(`REQUEST game ${gameIndex} "${entry.gameName.slice(0, 15)}" → PERMANENT FAILURE (skipped)`)
                return -1

            case HighTextureState.FAILED:
                if (entry.loadAttempts >= (this.config.maxLoadAttempts ?? 2)) {
                    entry.state = HighTextureState.PERMANENT_FAILURE
                    HighTextureCache.logger.info(`Game "${entry.gameName}" exceeded max load attempts (${entry.loadAttempts}), marking as permanent failure`)
                    return -1
                }
                this.stats.cacheMisses++
                HighTextureCache.logger.debug(`REQUEST game ${gameIndex} "${entry.gameName.slice(0, 15)}" → RETRY (attempt ${entry.loadAttempts + 1})`)
                this.triggerLoad(entry)
                return -1

            case HighTextureState.EMPTY:
                this.stats.cacheMisses++
                HighTextureCache.logger.debug(`REQUEST game ${gameIndex} "${entry.gameName.slice(0, 15)}" → MISS (triggering load)`)
                this.triggerLoad(entry)
                return -1
        }
    }

    public getHighSlot(gameIndex: number): number {
        return this.games.get(gameIndex)?.highSlot ?? -1
    }

    public isLoaded(gameIndex: number): boolean {
        return this.games.get(gameIndex)?.state === HighTextureState.LOADED
    }

    public getState(gameIndex: number): HighTextureState {
        return this.games.get(gameIndex)?.state ?? HighTextureState.EMPTY
    }

    private triggerLoad(entry: GameEntry): void {
        if (this.loadingPromises.has(entry.gameIndex)) {
            HighTextureCache.logger.debug(`TRIGGER game ${entry.gameIndex} → already loading, skip`)
            return
        }
        if (this.loadQueue.includes(entry.gameIndex)) {
            HighTextureCache.logger.debug(`TRIGGER game ${entry.gameIndex} → already queued at position ${this.loadQueue.indexOf(entry.gameIndex)}`)
            return
        }

        if (this.loadingPromises.size >= this.config.maxConcurrentLoads) {
            this.loadQueue.push(entry.gameIndex)
            HighTextureCache.logger.debug(`TRIGGER game ${entry.gameIndex} "${entry.gameName.slice(0, 15)}" → QUEUED (pos ${this.loadQueue.length}, active: ${this.loadingPromises.size})`)
            return
        }

        HighTextureCache.logger.debug(`TRIGGER game ${entry.gameIndex} "${entry.gameName.slice(0, 15)}" → starting load`)
        this.startLoad(entry)
    }
    
    /** Called when under the concurrent-load limit - see triggerLoad */
    private startLoad(entry: GameEntry): void {
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
            this.processQueue()
        })
    }

    /** Evicts LRU if the array is full. @returns slot index, or -1 if allocation failed */
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

        return slot
    }

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
    
    /** Cache key used for the network-URL path only - local disk art is keyed by GameArtworkProvider itself. */
    private cacheKeyFor(url: string): string {
        return UrlUtils.stripQueryParam(url, 't')
    }

    /**
     * Fire-and-forget fetch/decode/pixel-cache-store, so HIGH loading itself isn't blocked.
     * Only reached when GameArtworkProvider has no local-disk art for this appid (see
     * resolvePixelSource) - entry.artworkUrl is always a real network URL here. Entry stays in
     * CACHING state throughout; the next requestHighTexture() detects the cache is ready.
     */
    private async startBackgroundCaching(entry: GameEntry): Promise<void> {
        if (this.backgroundCachingGames.has(entry.gameIndex)) {
            return
        }

        const cacheKeyUrl = this.cacheKeyFor(entry.artworkUrl)
        const deadPaths = await AppDetailsCache.getDeadArtworkPaths(entry.appid)
        if (deadPaths.has(cacheKeyUrl)) {
            HighTextureCache.logger.debug(`BACKGROUND CACHE SKIP ${entry.gameIndex} "${entry.gameName.slice(0, 15)}" - known-dead URL`)
            entry.state = HighTextureState.FAILED
            return
        }

        this.backgroundCachingGames.add(entry.gameIndex)
        HighTextureCache.logger.debug(`BACKGROUND CACHE START ${entry.gameIndex} "${entry.gameName.slice(0, 15)}"`)

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
            if (result.width !== this.config.textureWidth || result.height !== this.config.textureHeight) {
                HighTextureCache.logger.warn(`BACKGROUND CACHE: size mismatch for "${entry.gameName}": expected ${this.config.textureWidth}×${this.config.textureHeight}, got ${result.width}×${result.height}`)
                entry.state = HighTextureState.FAILED
                this.backgroundCachingGames.delete(entry.gameIndex)
                return
            }

            await this.pixelCache.put(cacheKeyUrl, result.imageData, result.width, result.height)

            HighTextureCache.logger.debug(`BACKGROUND CACHE COMPLETE ${entry.gameIndex} "${entry.gameName.slice(0, 15)}" (${result.width}×${result.height})`)
            this.backgroundCachingGames.delete(entry.gameIndex)
        }).catch((err) => {
            const msg = err instanceof Error ? err.message : String(err)
            HighTextureCache.logger.debug(`BACKGROUND CACHE FAILED ${entry.gameIndex} "${entry.gameName.slice(0, 15)}": ${msg}`)
            entry.state = HighTextureState.FAILED
            this.backgroundCachingGames.delete(entry.gameIndex)
            AppDetailsCache.markArtworkPathDead(entry.appid, entry.artworkUrl).catch(() => { /* best-effort persistence */ })
        })
    }

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

        try {
            HighTextureCache.logger.debug(`START HIGH ${entry.gameIndex} → slot ${entry.highSlot} "${entry.gameName.slice(0, 20)}" | in-flight: ${this.loadingPromises.size}/${this.config.maxConcurrentLoads}, queue: ${this.loadQueue.length}`)

            const resolved = await this.resolvePixelSource(entry)
            if (!resolved) {
                // resolvePixelSource already moved entry to CACHING and released its slot.
                return false
            }

            if (!this.isExpectedPixelSize(resolved.imageData, entry.gameName)) {
                entry.state = HighTextureState.FAILED
                return false
            }

            const executedImmediately = this.scheduleTextureCompletion(entry, resolved.imageData)

            const totalTime = window.performance.now() - loadStart
            const inFlight = this.loadingPromises.size - 1  // -1 because this one is about to complete
            const cacheStatus = resolved.pixelCacheHit ? '🟢 PIXEL HIT' : '🔴 PIXEL MISS'
            const scheduled = executedImmediately ? 'immediate' : 'scheduled'
            HighTextureCache.logger.debug(`COMPLETE HIGH ${entry.gameIndex} → slot ${entry.highSlot} "${entry.gameName.slice(0, 20)}" | ${cacheStatus} | total: ${totalTime.toFixed(0)}ms (copy: ${scheduled}) | in-flight: ${inFlight}, queue: ${this.loadQueue.length}`)

            return true

        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            HighTextureCache.logger.debug(`Failed to load HIGH texture "${entry.gameName}": ${msg}`)
            entry.state = HighTextureState.FAILED
            this.releaseSlot(entry)
            return false
        }
    }

    /**
     * Local disk first (zero-network, same precedence GameArtworkProvider gives the MID tier),
     * then the pixel cache. On a full miss, releases the slot and defers to background caching,
     * leaving entry in CACHING state to be re-requested once caching completes - returns null.
     */
    private async resolvePixelSource(
        entry: GameEntry
    ): Promise<{ imageData: Uint8ClampedArray; pixelCacheHit: boolean } | null> {
        const localResult = await GameArtworkProvider.getInstance().fetchPixelsFromLocalDisk(
            entry.appid, 'library', this.config.textureWidth, this.config.textureHeight
        )
        if (localResult) {
            HighTextureCache.logger.debug(`LOCAL DISK HIT ${entry.gameIndex} "${entry.gameName.slice(0, 15)}" (${localResult.width}×${localResult.height})`)
            return { imageData: localResult.pixels, pixelCacheHit: localResult.fromCache }
        }

        const cachedPixels = await this.pixelCache.get(this.cacheKeyFor(entry.artworkUrl), this.config.textureWidth, this.config.textureHeight)
        if (cachedPixels) {
            this.stats.pixelCacheHits++
            HighTextureCache.logger.debug(`PIXEL CACHE HIT ${entry.gameIndex} "${entry.gameName.slice(0, 15)}" (${cachedPixels.width}×${cachedPixels.height})`)
            return { imageData: cachedPixels.pixelData, pixelCacheHit: true }
        }

        this.stats.pixelCacheMisses++
        HighTextureCache.logger.debug(`PIXEL CACHE MISS ${entry.gameIndex} "${entry.gameName.slice(0, 15)}" → deferring to background caching`)

        this.releaseSlot(entry)
        void this.startBackgroundCaching(entry)
        entry.state = HighTextureState.CACHING
        return null
    }

    private isExpectedPixelSize(imageData: Uint8ClampedArray, gameName: string): boolean {
        const expectedSize = this.config.textureWidth * this.config.textureHeight * 4
        if (imageData.length === expectedSize) {
            return true
        }
        HighTextureCache.logger.warn(`HIGH texture data size mismatch for "${gameName}": expected ${expectedSize}, got ${imageData.length}`)
        return false
    }

    /**
     * Runs immediately if there's frame budget, otherwise deferred (see FrameBudgetScheduler).
     * Captures gameIndex/slot up front rather than reading them off `entry` inside the closure,
     * since eviction (evictGame/evictAll) can reassign entry's slot while this load is in flight.
     * @returns true if the completion ran immediately, false if deferred to a later frame.
     */
    private scheduleTextureCompletion(entry: GameEntry, imageData: Uint8ClampedArray): boolean {
        const capturedGameIndex = entry.gameIndex
        const capturedSlot = entry.highSlot

        const doTextureCompletion = () => {
            this.managedArray!.setSlotPixels(capturedSlot, imageData)
            entry.state = HighTextureState.LOADED
            entry.lastAccessTime = window.performance.now()
            this.onSlotChange?.(capturedGameIndex, capturedSlot)
        }

        return this.scheduler.tryExecuteOrSchedule(doTextureCompletion, {
            estimatedMs: 0.5,  // avg 0.2ms, max 1ms observed
            priority: 'normal',
            maxDeferMs: 500   // 30 frames at 60fps
        })
    }

    /** Hint only - the texture is evicted when space is needed, not immediately */
    public markForEviction(gameIndex: number): void {
        const entry = this.games.get(gameIndex)
        if (entry?.state !== HighTextureState.LOADED) {
            return
        }
        entry.lastAccessTime = 0
        HighTextureCache.logger.debug(`Marked for eviction: game ${gameIndex} slot ${entry.highSlot} "${entry.gameName.slice(0, 20)}"`)
    }

    private getUsedSlotCount(): number {
        return this.slotAllocator.getUsedSlotCount()
    }

    private estimateMemoryMB(): number {
        const bytesPerTexture = this.config.textureWidth * this.config.textureHeight * 4
        return (this.config.totalSlots * bytesPerTexture) / (1024 * 1024)
    }

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
     * Called when the app loses focus for an extended period, to release GPU memory - games
     * reload from pixel cache (fast) or network (slow) on next request.
     */
    public evictAll(): number {
        let evictedCount = 0
        for (const entry of this.games.values()) {
            if (entry.state === HighTextureState.LOADED && entry.highSlot >= 0) {
                const gameIndex = entry.gameIndex
                this.releaseSlot(entry)
                entry.state = HighTextureState.EMPTY
                this.stats.evictions++
                evictedCount++
                this.onSlotChange?.(gameIndex, -1)
            }
        }
        this.loadQueue = [] // no point loading while unfocused
        if (evictedCount > 0) {
            HighTextureCache.logger.info(`evictAll: released ${evictedCount} HIGH texture slots`)
        }
        return evictedCount
    }

    public evictGame(gameIndex: number): boolean {
        const entry = this.games.get(gameIndex)
        if (!entry || entry.highSlot < 0) {
            return false
        }

        this.releaseSlot(entry)
        entry.state = HighTextureState.EMPTY
        this.stats.evictions++
        this.onSlotChange?.(gameIndex, -1)

        return true
    }

    /**
     * Releases a slot this entry currently holds back to the allocator and clears its own
     * bookkeeping. Only valid when the entry itself still owns the slot - allocateSlot()'s
     * internal eviction-during-allocation branch is a different case (the allocator has already
     * reassigned the slot there, so calling this would clear the NEW owner's slot instead).
     */
    private releaseSlot(entry: GameEntry): void {
        if (entry.highSlot < 0) {
            return
        }
        this.slotAllocator.clearSlot(entry.highSlot)
        entry.highSlot = -1
    }

    public dispose(): void {
        this.games.clear()
        this.loadingPromises.clear()
        this.loadQueue = []
        this.slotAllocator.clearAll()
        this.textureWorker.dispose()
        HighTextureCache.logger.lifecycle('Disposed')
    }
}

