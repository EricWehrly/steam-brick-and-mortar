/**
 * Game Artwork Provider - Universal artwork retrieval for any renderer
 *
 * TD: singleton-pattern-refactor
 *
 * - URL for the artwork
 * - Pixel data (Uint8ClampedArray) at requested dimensions
 * - Format information
 * 
 * Works with:
 * - LodGameArtworkRenderer (instanced boxes)
 * - GameBinder (legacy single-mesh boxes)
 * - Any future renderer that needs Steam artwork
 * 
 * Handles internally:
 * - URL strategy (primary vs fallback CDN URLs)
 * - Persistent failure/success caching
 * - Coordination with TextureWorker for fetching
 * - PixelDataCache for disk caching
 */

import { Logger } from '../../../utils/Logger'
import { TextureWorker } from './TextureWorker'
import { PixelDataCache } from './PixelDataCache'
import { GameArtworkRequest } from './GameArtworkRequest'
import { resizePixels } from './ArtworkPixelUtils'

// Class-scoped logger will be attached to the class

/** Supported artwork formats */
export type ArtworkFormat = 'library' | 'header' | 'capsule'

/** Artwork dimensions for each format */
export const ARTWORK_DIMENSIONS: Record<ArtworkFormat, { width: number; height: number }> = {
    library: { width: 300, height: 450 },   // Portrait (2:3 aspect)
    header: { width: 460, height: 215 },    // Landscape header
    capsule: { width: 616, height: 353 }    // Landscape capsule
}

/** Result of fetching pixel data */
export interface PixelDataResult {
    pixels: Uint8ClampedArray
    width: number
    height: number
    fromCache: boolean
}

/**
 * A handle to artwork for a specific game.
 * Lazily fetches data on demand, can be queried multiple times.
 */
export interface GameArtwork {
    readonly appId: number
    readonly gameName: string
    readonly format: ArtworkFormat
    
    /** Get the URL for this artwork (resolved from strategy) */
    getUrl(): string
    
    /** 
     * Get pixel data at native resolution for this format.
     * Returns cached data if available, otherwise fetches.
     */
    getPixels(): Promise<PixelDataResult>
    
    /**
     * Get pixel data resized to specific dimensions.
     * Useful for LOD tiers that need smaller textures.
     */
    getPixelsAtSize(width: number, height: number): Promise<PixelDataResult>
    
    /** Check if pixel data is already cached (won't trigger network) */
    isCached(): Promise<boolean>
    
    /** Get failure reason if artwork couldn't be loaded */
    getFailureReason(): FailureReason | null
}

/** Detailed failure reasons for artwork loading */
export type FailureReason = 
    | 'CORS'           // CORS policy blocked (permanent)
    | '404'            // Not found on CDN (permanent)
    | 'NO_ARTWORK'     // Game has no artwork available (permanent dead-end)
    | 'TIMEOUT'        // Request timed out (retryable)
    | 'NETWORK'        // Network error (retryable)
    | 'DECODE'         // Image decode failed (permanent)
    | 'UNKNOWN'        // Unknown error (retryable)

/** Internal tracking for URL failures/successes */
interface UrlCacheEntry {
    timestamp: number
    // For failures
    reason?: FailureReason
    urlsTried?: string[]
    attemptCount?: number
    isPermanent?: boolean  // True for dead-ends we shouldn't retry
    // For successes (fallback URL that worked)
    fallbackUrl?: string
    fallbackType?: string
}

/** Fallback URL patterns for Steam CDN */
const FALLBACK_PATTERNS: Record<ArtworkFormat, Array<{ pattern: string; name: string }>> = {
    library: [
        { pattern: 'library_600x900.jpg', name: 'library' }
    ],
    header: [
        { pattern: 'header.jpg', name: 'header' }
    ],
    capsule: [
        { pattern: 'capsule_616x353.jpg', name: 'capsule' },
        { pattern: 'header.jpg', name: 'header-fallback' }
    ]
}

/**
 * Provider for game artwork - singleton that manages caching and URL strategies.
 */
export class GameArtworkProvider {
    private static instance: GameArtworkProvider | null = null
    public static logger = Logger.createLogFunctions(GameArtworkProvider.name)
    
    private textureWorker: TextureWorker
    private pixelCache: PixelDataCache | null = null
    
    // Persistent URL caches (localStorage)
    public static readonly FAILURE_CACHE_KEY = 'steam-artwork-failures-v4'
    public static readonly SUCCESS_CACHE_KEY = 'steam-artwork-successes-v4'
    private static readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000  // 24 hours
    
    private failureCache: Map<string, UrlCacheEntry> = new Map()  // key: appId-format
    private successCache: Map<string, UrlCacheEntry> = new Map()
    
    // Skip tracking (per session)
    private skipStats: Map<FailureReason, number> = new Map()
    private skippedGames: Array<{ appId: number; gameName: string; reason: FailureReason }> = []
    
    private constructor() {
        this.textureWorker = new TextureWorker()
        this.loadPersistentCaches()
        this.initPixelCache()
        this.logFailureStats()
    }
    
    public static getInstance(): GameArtworkProvider {
        if (!GameArtworkProvider.instance) {
            GameArtworkProvider.instance = new GameArtworkProvider()
        }
        return GameArtworkProvider.instance
    }
    
    private async initPixelCache(): Promise<void> {
        try {
            this.pixelCache = PixelDataCache.getInstance()
            await this.pixelCache.init()
        } catch (err) {
            GameArtworkProvider.logger.warn('PixelDataCache init failed:', err)
        }
    }
    
    /**
     * Get artwork for a game.
     * Returns a GameArtwork handle that can be queried for URL, pixels, etc.
     */
    public getArtwork(
        appId: number,
        gameName: string,
        format: ArtworkFormat = 'library',
        preferredUrl?: string
    ): GameArtwork {
        return new GameArtworkRequest(
            appId,
            gameName,
            format,
            preferredUrl,
            this
        )
    }
    
    /**
     * Build the URL strategy for an appId/format.
     * Returns ordered list of URLs to try.
     */
    public buildUrlStrategy(
        appId: number,
        format: ArtworkFormat,
        preferredUrl?: string
    ): Array<{ url: string; type: string }> {
        const cacheKey = `${appId}-${format}`
        const urls: Array<{ url: string; type: string }> = []
        
        // Check if we have a known-good fallback URL
        const cachedSuccess = this.successCache.get(cacheKey)
        if (cachedSuccess?.fallbackUrl) {
            urls.push({ url: cachedSuccess.fallbackUrl, type: `cached-${cachedSuccess.fallbackType}` })
        }
        
        // Add preferred URL if provided (usually from Steam API metadata)
        if (preferredUrl) {
            const alreadyAdded = urls.some(u => u.url === preferredUrl)
            if (!alreadyAdded) {
                urls.push({ url: preferredUrl, type: 'preferred' })
            }
        }
        
        // Add CDN fallback URLs
        const isNewCdn = preferredUrl?.includes('shared.akamai.steamstatic.com') || 
                         preferredUrl?.includes('store_item_assets')
        
        if (!isNewCdn) {
            const baseUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${appId}`
            const patterns = FALLBACK_PATTERNS[format] || FALLBACK_PATTERNS.library
            
            for (const { pattern, name } of patterns) {
                const fallbackUrl = `${baseUrl}/${pattern}`
                const alreadyAdded = urls.some(u => u.url === fallbackUrl)
                if (!alreadyAdded) {
                    urls.push({ url: fallbackUrl, type: `cdn-${name}` })
                }
            }
        }
        
        return urls
    }
    
    /**
     * Fetch pixel data for a URL, with caching.
     */
    public async fetchPixels(
        url: string,
        targetWidth: number,
        targetHeight: number,
        cacheKey: string
    ): Promise<PixelDataResult> {
        // Build a size-qualified cache key for disk lookups
        const sizedCacheUrl = `${url}@${targetWidth}x${targetHeight}`

        // Check disk cache first
        if (this.pixelCache) {
            const cached = await this.pixelCache.get(sizedCacheUrl)
            if (cached) {
                // If cached at different size, we may need to resize
                if (cached.width === targetWidth && cached.height === targetHeight) {
                    return {
                        pixels: cached.pixelData,
                        width: cached.width,
                        height: cached.height,
                        fromCache: true
                    }
                }
                // Resize cached data to target size
                const resized = resizePixels(
                    cached.pixelData, cached.width, cached.height,
                    targetWidth, targetHeight
                )
                return {
                    pixels: resized,
                    width: targetWidth,
                    height: targetHeight,
                    fromCache: true
                }
            }
        }
        
        // Fetch from network
        const result = await this.textureWorker.fetchAndProcessWithOptions(
            url, 0, cacheKey,
            { textureWidth: targetWidth, textureHeight: targetHeight, timeout: 10000 }
        )
        
        // Always store using size-qualified key
        if (this.pixelCache) {
            await this.pixelCache.put(sizedCacheUrl, result.imageData, targetWidth, targetHeight)
        }
        
        return {
            pixels: result.imageData,
            width: targetWidth,
            height: targetHeight,
            fromCache: false
        }
    }
    
    /**
     * Check if pixels are cached for a URL.
     */
    public async isPixelsCached(url: string, width?: number, height?: number): Promise<boolean> {
        if (!this.pixelCache) return false
        const key = (width !== undefined && height !== undefined) ? `${url}@${width}x${height}` : url
        const cached = await this.pixelCache.get(key)
        return cached !== null
    }
    
    /**
     * Record a URL failure.
     */
    /**
     * Determine if a failure reason is permanent (should not retry).
     */
    private static isReasonPermanent(reason: FailureReason | undefined): boolean {
        return reason === 'NO_ARTWORK' || reason === 'CORS' || reason === 'DECODE' || reason === '404'
    }

    public recordFailure(
        appId: number,
        format: ArtworkFormat,
        reason: FailureReason,
        urlsTried: string[]
    ): void {
        const cacheKey = `${appId}-${format}`
        const existing = this.failureCache.get(cacheKey)
        const attemptCount = (existing?.attemptCount ?? 0) + 1
        
        // Permanent failures: NO_ARTWORK, CORS, DECODE, and 404.
        // 404 from Steam CDN is permanent — the image doesn't exist on the CDN.
        // (CORS failures sometimes mask 404s; both are unretryable.)
        const isPermanent = GameArtworkProvider.isReasonPermanent(reason)
        
        this.failureCache.set(cacheKey, {
            timestamp: Date.now(),
            reason,
            urlsTried,
            attemptCount,
            isPermanent
        })
        this.savePersistentFailures()
        
        // Log permanent failures clearly
        if (isPermanent) {
            GameArtworkProvider.logger.info(
                `🚫 Permanent failure for appId ${appId}: ${reason} (will skip future attempts)`
            )
        }
    }
    
    /**
     * Record a URL success (when fallback worked).
     */
    public recordSuccess(
        appId: number,
        format: ArtworkFormat,
        fallbackUrl: string,
        fallbackType: string
    ): void {
        const cacheKey = `${appId}-${format}`
        this.successCache.set(cacheKey, {
            timestamp: Date.now(),
            fallbackUrl,
            fallbackType
        })
        this.savePersistentSuccesses()
    }
    
    /**
     * Check if an appId/format is known to have failed.
     */
    public isKnownFailure(appId: number, format: ArtworkFormat): boolean {
        const cacheKey = `${appId}-${format}`
        return this.failureCache.has(cacheKey)
    }
    
    /**
     * Get failure reason for an appId/format.
     */
    public getFailureReason(appId: number, format: ArtworkFormat): FailureReason | null {
        const cacheKey = `${appId}-${format}`
        return this.failureCache.get(cacheKey)?.reason ?? null
    }
    
    /**
     * Check if failure is permanent (should not retry).
     */
    public isPermanentFailure(appId: number, format: ArtworkFormat): boolean {
        const cacheKey = `${appId}-${format}`
        return this.failureCache.get(cacheKey)?.isPermanent ?? false
    }
    
    /**
     * Record a skipped attempt (permanent failure).
     */
    public recordSkip(appId: number, gameName: string, reason: FailureReason): void {
        this.skipStats.set(reason, (this.skipStats.get(reason) || 0) + 1)
        this.skippedGames.push({ appId, gameName, reason })
    }
    
    /**
     * Get skip statistics for this session.
     */
    public getSkipStats(): { total: number; byReason: Record<FailureReason, number> } {
        const byReason: Record<string, number> = {}
        for (const [reason, count] of this.skipStats) {
            byReason[reason] = count
        }
        return {
            total: this.skippedGames.length,
            byReason: byReason as Record<FailureReason, number>
        }
    }
    
    /**
     * Log skip statistics summary.
     */
    public logSkipSummary(): void {
        if (this.skippedGames.length === 0) return
        
        const reasons: string[] = []
        for (const [reason, count] of this.skipStats) {
            reasons.push(`${reason}: ${count}`)
        }
        
        GameArtworkProvider.logger.info(
            `📊 Skipped ${this.skippedGames.length} permanent failures this session (${reasons.join(', ')})`
        )
    }
    
    /**
     * Clear skip statistics.
     */
    public clearSkipStats(): void {
        this.skipStats.clear()
        this.skippedGames = []
    }
    
    /**
     * Get failure statistics grouped by reason.
     */
    public getFailureStats(): Record<FailureReason, number> & { total: number; permanent: number } {
        const stats: Record<string, number> = {
            total: 0,
            permanent: 0
        }
        
        for (const entry of this.failureCache.values()) {
            if (entry.reason) {
                stats[entry.reason] = (stats[entry.reason] || 0) + 1
                stats.total++
                if (entry.isPermanent) stats.permanent++
            }
        }
        
        return stats as Record<FailureReason, number> & { total: number; permanent: number }
    }
    
    /**
     * Clear all caches (force retry of failed URLs).
     */
    public clearCaches(): void {
        this.failureCache.clear()
        this.successCache.clear()
        try {
            localStorage.removeItem(GameArtworkProvider.FAILURE_CACHE_KEY)
            localStorage.removeItem(GameArtworkProvider.SUCCESS_CACHE_KEY)
            GameArtworkProvider.logger.info('Cleared artwork caches')
        } catch (e) {
            GameArtworkProvider.logger.debug('Could not clear localStorage:', e)
        }
    }
    
    /**
     * Log failure statistics summary at startup.
     */
    private logFailureStats(): void {
        const stats = this.getFailureStats()
        if (stats.total === 0) return
        
        const reasons: string[] = []
        for (const [reason, count] of Object.entries(stats)) {
            if (reason !== 'total' && reason !== 'permanent' && count > 0) {
                reasons.push(`${reason}: ${count}`)
            }
        }
        
        if (reasons.length > 0) {
            GameArtworkProvider.logger.info(
                `📊 Artwork failures: ${stats.total} total, ${stats.permanent} permanent dead-ends (${reasons.join(', ')})`
            )
        }
    }
    
    private loadPersistentCaches(): void {
        const now = Date.now()
        
        try {
            const failures = localStorage.getItem(GameArtworkProvider.FAILURE_CACHE_KEY)
            if (failures) {
                const data = JSON.parse(failures) as Record<string, UrlCacheEntry>
                let count = 0
                let migrated = 0
                for (const [key, entry] of Object.entries(data)) {
                    if (now - entry.timestamp < GameArtworkProvider.CACHE_TTL_MS) {
                        // Migrate old entries without isPermanent/attemptCount
                        if (entry.isPermanent === undefined) {
                            entry.attemptCount = entry.attemptCount ?? 1
                            entry.isPermanent = GameArtworkProvider.isReasonPermanent(entry.reason)
                            migrated++
                        }
                        this.failureCache.set(key, entry)
                        count++
                    }
                }
                if (count > 0) {
                    GameArtworkProvider.logger.info(`Loaded ${count} cached failures`)
                    if (migrated > 0) {
                        GameArtworkProvider.logger.info(`Migrated ${migrated} old cache entries`)
                        this.savePersistentFailures()  // Save migrated entries
                    }
                }
            }
        } catch (e) {
            GameArtworkProvider.logger.debug('Could not load failure cache:', e)
        }
        
        try {
            const successes = localStorage.getItem(GameArtworkProvider.SUCCESS_CACHE_KEY)
            if (successes) {
                const data = JSON.parse(successes) as Record<string, UrlCacheEntry>
                let count = 0
                for (const [key, entry] of Object.entries(data)) {
                    if (now - entry.timestamp < GameArtworkProvider.CACHE_TTL_MS) {
                        this.successCache.set(key, entry)
                        count++
                    }
                }
                if (count > 0) GameArtworkProvider.logger.info(`Loaded ${count} cached successes`)
            }
        } catch (e) {
            GameArtworkProvider.logger.debug('Could not load success cache:', e)
        }
    }
    
    private savePersistentFailures(): void {
        try {
            const data: Record<string, UrlCacheEntry> = {}
            for (const [key, entry] of this.failureCache) {
                data[key] = entry
            }
            localStorage.setItem(GameArtworkProvider.FAILURE_CACHE_KEY, JSON.stringify(data))
        } catch (e) {
            GameArtworkProvider.logger.debug('Could not save failure cache:', e)
        }
    }
    
    private savePersistentSuccesses(): void {
        try {
            const data: Record<string, UrlCacheEntry> = {}
            for (const [key, entry] of this.successCache) {
                data[key] = entry
            }
            localStorage.setItem(GameArtworkProvider.SUCCESS_CACHE_KEY, JSON.stringify(data))
        } catch (e) {
            GameArtworkProvider.logger.debug('Could not save success cache:', e)
        }
    }
    
    public dispose(): void {
        this.textureWorker.dispose()
        GameArtworkProvider.instance = null
        GameArtworkProvider.logger.lifecycle('Disposed')
    }
}
