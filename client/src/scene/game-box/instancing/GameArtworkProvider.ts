/**
 * Game Artwork Provider - Universal artwork retrieval for any renderer
 *
 * - Runtime failure/success caching (session only)
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
 * - Runtime failure/success caching
 * - Coordination with TextureWorker for fetching
 * - PixelDataCache for disk caching
 */

import { Logger } from '../../../utils/Logger'
import { UrlUtils } from '../../../utils/UrlUtils'
import { TextureWorker } from './TextureWorker'
import { PixelDataCache } from './PixelDataCache'
import { GameArtworkRequest } from './GameArtworkRequest'
import { resizePixels } from './ArtworkPixelUtils'
import { LocalLibraryArtReader, type LocalArtSlot, type LocalLibraryArtEntry } from '../../../steam/LocalLibraryArtReader'

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

    /** 
     * Get pixel data at native resolution for this format.
     * Returns cached data if available, otherwise fetches.
     */
    /**
     * Get pixel data resized to specific dimensions.
     * Useful for LOD tiers that need smaller textures.
     */
    getPixelsAtSize(width: number, height: number): Promise<PixelDataResult>
    
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

export type CdnArtworkType = 'library' | 'capsule' | 'header'

const CDN_PATTERNS: Record<CdnArtworkType, string> = {
    library: 'library_600x900.jpg',
    capsule: 'capsule_616x353.jpg',
    header: 'header.jpg'
}

type ArtworkHintType = 'library' | 'header'

const STRATEGY_BY_FORMAT: Record<ArtworkFormat, {
    hintOrder: readonly ArtworkHintType[]
    cdnOrder: readonly CdnArtworkType[]
}> = {
    library: {
        hintOrder: ['library', 'header'],
        cdnOrder: ['library', 'capsule', 'header']
    },
    header: {
        hintOrder: ['header', 'library'],
        cdnOrder: ['header']
    },
    capsule: {
        hintOrder: ['header', 'library'],
        cdnOrder: ['capsule']
    }
}

interface RuntimeArtworkCacheEntry {
    reason?: FailureReason
    urlsTried?: string[]
    attemptCount?: number
    isPermanent?: boolean
    fallbackUrl?: string
    fallbackType?: string
}

/**
 * Provider for game artwork - singleton that manages caching and URL strategies.
 */
export class GameArtworkProvider {
    private static instance: GameArtworkProvider | null = null
    public static logger = Logger.createLogFunctions(GameArtworkProvider.name)
    
    private textureWorker: TextureWorker
    private pixelCache: PixelDataCache | null = null
    private readonly failureCache = new Map<string, RuntimeArtworkCacheEntry>()
    private readonly successCache = new Map<string, RuntimeArtworkCacheEntry>()
    private readonly localArtIndex = new Map<number, LocalLibraryArtEntry>()

    // Skip tracking (per session)
    private skipStats: Map<FailureReason, number> = new Map()
    private skippedGames: Array<{ appId: number; gameName: string; reason: FailureReason }> = []

    private constructor() {
        this.textureWorker = new TextureWorker()
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
        artworkHints?: { library?: string; header?: string }
    ): GameArtwork {
        return new GameArtworkRequest(
            appId,
            gameName,
            format,
            artworkHints,
            this
        )
    }
    
    /**
     * Build the URL strategy for an appId/format.
     * Consolidates all candidate ordering in one place.
     * Priority: Library > Header > Capsule
     */
    public buildUrlStrategy(
        appId: number,
        format: ArtworkFormat,
        artworkHints?: { library?: string; header?: string }
    ): Array<{ url: string; type: string }> {
        const urls: Array<{ url: string; type: string }> = []
        const seen = new Set<string>()
        const sourceByUrl = new Map<string, string>()

        const addUrl = (url: string | undefined, type: string): void => {
            if (!url) return

            if (seen.has(url)) {
                const existingType = sourceByUrl.get(url)
                const metadataVsCdnDuplicate = Boolean(existingType) && (
                    (existingType!.startsWith('metadata-') && type.startsWith('cdn-')) ||
                    (existingType!.startsWith('cdn-') && type.startsWith('metadata-'))
                )

                if (metadataVsCdnDuplicate) {
                    GameArtworkProvider.logger.debug(
                        `Strategy deduped duplicate URL for appId ${appId}: existing=${existingType}; skipped=${type}; url=${url}`
                    )
                }
                return
            }

            seen.add(url)
            sourceByUrl.set(url, type)
            urls.push({ url, type })
        }

        const strategy = STRATEGY_BY_FORMAT[format]
        const baseUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${appId}`

        for (const hintType of strategy.hintOrder) {
            addUrl(artworkHints?.[hintType], `metadata-${hintType}`)
        }

        for (const cdnType of strategy.cdnOrder) {
            addUrl(`${baseUrl}/${CDN_PATTERNS[cdnType]}`, `cdn-${cdnType}`)
        }

        // Keep historical success as a final candidate
        const cachedSuccess = this.getSuccessEntry(appId, format)
        if (cachedSuccess?.fallbackUrl) {
            addUrl(cachedSuccess.fallbackUrl, `cached-${cachedSuccess.fallbackType}`)
        }
        
        return urls
    }
    
    /**
     * Registers this session's local-librarycache scan results (see LocalLibraryArtReader) -
     * called once from the local-scan startup pass. A no-op call (empty array, or never called at
     * all on the web build) just means fetchPixelsFromLocalDisk always misses, falling through to
     * the normal URL strategy - not an error state.
     */
    public registerLocalArtIndex(entries: readonly LocalLibraryArtEntry[]): void {
        for (const entry of entries) {
            this.localArtIndex.set(entry.appid, entry)
        }
    }

    private getLocalArtSlot(appId: number, format: ArtworkFormat): LocalArtSlot | undefined {
        if (format !== 'library' && format !== 'header') {
            return undefined
        }
        return this.localArtIndex.get(appId)?.[format]
    }

    /**
     * Read pixels straight from Steam's own local librarycache, zero network - see
     * docs/plans/startup-artwork-resolution-plan.md, Root Cause D. Returns null (not a rejected
     * promise) whenever this isn't available for the appId/format, so callers can fall through to
     * the normal URL strategy the same way a cache miss would: no local index entry, no matching
     * slot, or the disk read/decode itself fails for any reason (file moved, permissions, etc.).
     */
    public async fetchPixelsFromLocalDisk(
        appId: number,
        format: ArtworkFormat,
        targetWidth: number,
        targetHeight: number
    ): Promise<PixelDataResult | null> {
        const slot = this.getLocalArtSlot(appId, format)
        if (!slot) {
            return null
        }

        // No `?t=` instability here (it's not a real URL) - stable per appId/asset by construction.
        const cacheKeyUrl = `local://${appId}/${slot.relative_path}`
        const sizedCacheUrl = `${cacheKeyUrl}@${targetWidth}x${targetHeight}`

        if (this.pixelCache) {
            const cached = await this.pixelCache.get(sizedCacheUrl)
            if (cached) {
                if (cached.width === targetWidth && cached.height === targetHeight) {
                    return { pixels: cached.pixelData, width: cached.width, height: cached.height, fromCache: true }
                }
                const resized = resizePixels(cached.pixelData, cached.width, cached.height, targetWidth, targetHeight)
                return { pixels: resized, width: targetWidth, height: targetHeight, fromCache: true }
            }
        }

        try {
            const bytes = await LocalLibraryArtReader.readArtBytes(appId, slot.relative_path)
            if (!bytes) {
                return null
            }

            const result = await this.textureWorker.processLocalBytes(
                bytes, slot.relative_path, 0, `${appId}-${format}`,
                { textureWidth: targetWidth, textureHeight: targetHeight }
            )

            if (this.pixelCache) {
                await this.pixelCache.put(sizedCacheUrl, result.imageData, targetWidth, targetHeight)
            }

            return { pixels: result.imageData, width: targetWidth, height: targetHeight, fromCache: false }
        } catch (err) {
            GameArtworkProvider.logger.warn(
                `Local disk art read/decode failed for appId ${appId} (${slot.relative_path}), falling back to network:`, err
            )
            return null
        }
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
        // Build a size-qualified cache key for disk lookups. Steam's own hint URLs (header_image
        // etc.) carry a `?t=` cache-busting timestamp that Steam itself rotates - stripped here so
        // the same artwork keeps hitting the same disk-cache entry across sessions. The fetch below
        // still uses the original url unmodified.
        const cacheKeyUrl = UrlUtils.stripQueryParam(url, 't')
        const sizedCacheUrl = `${cacheKeyUrl}@${targetWidth}x${targetHeight}`

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
        const cacheKeyUrl = UrlUtils.stripQueryParam(url, 't')
        const key = (width !== undefined && height !== undefined) ? `${cacheKeyUrl}@${width}x${height}` : cacheKeyUrl
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
        const existing = this.getFailureEntry(appId, format)
        const attemptCount = (existing?.attemptCount ?? 0) + 1
        
        // Permanent failures: NO_ARTWORK, CORS, DECODE, and 404.
        // 404 from Steam CDN is permanent — the image doesn't exist on the CDN.
        // (CORS failures sometimes mask 404s; both are unretryable.)
        const isPermanent = GameArtworkProvider.isReasonPermanent(reason)
        
        this.setFailureEntry(appId, format, {
            ...existing,
            reason,
            urlsTried,
            attemptCount,
            isPermanent
        })
        
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
        const existing = this.getSuccessEntry(appId, format)
        this.setSuccessEntry(appId, format, {
            ...existing,
            fallbackUrl,
            fallbackType
        })
    }

    /**
     * Clear cached success/failure outcomes for a single game+format.
     * Useful for explicit user-driven retry flows.
     */
    public clearCachedOutcome(appId: number, format: ArtworkFormat): void {
        this.deleteFailureEntry(appId, format)
        this.deleteSuccessEntry(appId, format)
    }
    
    /**
     * Check if an appId/format is known to have failed.
     */
    public isKnownFailure(appId: number, format: ArtworkFormat): boolean {
        return this.getFailureEntry(appId, format)?.reason !== undefined
    }
    
    /**
     * Get failure reason for an appId/format.
     */
    public getFailureReason(appId: number, format: ArtworkFormat): FailureReason | null {
        return this.getFailureEntry(appId, format)?.reason ?? null
    }
    
    /**
     * Check if failure is permanent (should not retry).
     */
    public isPermanentFailure(appId: number, format: ArtworkFormat): boolean {
        return this.getFailureEntry(appId, format)?.isPermanent ?? false
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
        GameArtworkProvider.logger.info('Cleared artwork caches')
    }

    private getFailureEntry(appId: number, format: ArtworkFormat): RuntimeArtworkCacheEntry | null {
        return this.failureCache.get(this.cacheKey(appId, format)) ?? null
    }

    private setFailureEntry(appId: number, format: ArtworkFormat, cacheEntry: RuntimeArtworkCacheEntry): void {
        this.failureCache.set(this.cacheKey(appId, format), cacheEntry)
    }

    private deleteFailureEntry(appId: number, format: ArtworkFormat): void {
        this.failureCache.delete(this.cacheKey(appId, format))
    }

    private getSuccessEntry(appId: number, format: ArtworkFormat): RuntimeArtworkCacheEntry | null {
        return this.successCache.get(this.cacheKey(appId, format)) ?? null
    }

    private setSuccessEntry(appId: number, format: ArtworkFormat, cacheEntry: RuntimeArtworkCacheEntry): void {
        this.successCache.set(this.cacheKey(appId, format), cacheEntry)
    }

    private deleteSuccessEntry(appId: number, format: ArtworkFormat): void {
        this.successCache.delete(this.cacheKey(appId, format))
    }

    private cacheKey(appId: number, format: ArtworkFormat): string {
        return `${appId}-${format}`
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
    
    public dispose(): void {
        this.textureWorker.dispose()
        GameArtworkProvider.instance = null
        GameArtworkProvider.logger.lifecycle('Disposed')
    }
}
