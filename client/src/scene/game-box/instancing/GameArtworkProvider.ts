/**
 * Game Artwork Provider - Universal artwork retrieval for any renderer
 * 
 * Given an appId, returns a GameArtwork object that can provide:
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
    getFailureReason(): string | null
}

/** Internal tracking for URL failures/successes */
interface UrlCacheEntry {
    timestamp: number
    // For failures
    reason?: string
    urlsTried?: string[]
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
    private static readonly FAILURE_CACHE_KEY = 'steam-artwork-failures-v2'
    private static readonly SUCCESS_CACHE_KEY = 'steam-artwork-successes-v2'
    private static readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000  // 24 hours
    
    private failureCache: Map<string, UrlCacheEntry> = new Map()  // key: appId-format
    private successCache: Map<string, UrlCacheEntry> = new Map()
    
    private constructor() {
        this.textureWorker = new TextureWorker()
        this.loadPersistentCaches()
        this.initPixelCache()
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
        return new GameArtworkHandle(
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
        // Check disk cache first
        if (this.pixelCache) {
            const cached = await this.pixelCache.get(url)
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
                const resized = this.resizePixels(
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
        
        // Cache at native size for future use
        if (this.pixelCache) {
            const nativeDims = this.getNativeDimensionsFromUrl(url)
            if (nativeDims.width === targetWidth && nativeDims.height === targetHeight) {
                await this.pixelCache.put(url, result.imageData, targetWidth, targetHeight)
            }
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
    public async isPixelsCached(url: string): Promise<boolean> {
        if (!this.pixelCache) return false
        const cached = await this.pixelCache.get(url)
        return cached !== null
    }
    
    /**
     * Record a URL failure.
     */
    public recordFailure(
        appId: number,
        format: ArtworkFormat,
        reason: string,
        urlsTried: string[]
    ): void {
        const cacheKey = `${appId}-${format}`
        this.failureCache.set(cacheKey, {
            timestamp: Date.now(),
            reason,
            urlsTried
        })
        this.savePersistentFailures()
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
    public getFailureReason(appId: number, format: ArtworkFormat): string | null {
        const cacheKey = `${appId}-${format}`
        return this.failureCache.get(cacheKey)?.reason ?? null
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
    
    private getNativeDimensionsFromUrl(url: string): { width: number; height: number } {
        if (url.includes('library_600x900')) return ARTWORK_DIMENSIONS.library
        if (url.includes('header')) return ARTWORK_DIMENSIONS.header
        if (url.includes('capsule')) return ARTWORK_DIMENSIONS.capsule
        return ARTWORK_DIMENSIONS.library  // Default
    }
    
    private resizePixels(
        src: Uint8ClampedArray,
        srcWidth: number,
        srcHeight: number,
        dstWidth: number,
        dstHeight: number
    ): Uint8ClampedArray {
        const dst = new Uint8ClampedArray(dstWidth * dstHeight * 4)
        const scaleX = srcWidth / dstWidth
        const scaleY = srcHeight / dstHeight
        
        for (let dstY = 0; dstY < dstHeight; dstY++) {
            for (let dstX = 0; dstX < dstWidth; dstX++) {
                const srcX0 = Math.floor(dstX * scaleX)
                const srcY0 = Math.floor(dstY * scaleY)
                const srcX1 = Math.min(Math.ceil((dstX + 1) * scaleX), srcWidth)
                const srcY1 = Math.min(Math.ceil((dstY + 1) * scaleY), srcHeight)
                
                let r = 0, g = 0, b = 0, a = 0, count = 0
                for (let sy = srcY0; sy < srcY1; sy++) {
                    for (let sx = srcX0; sx < srcX1; sx++) {
                        const srcIdx = (sy * srcWidth + sx) * 4
                        r += src[srcIdx]
                        g += src[srcIdx + 1]
                        b += src[srcIdx + 2]
                        a += src[srcIdx + 3]
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
    
    private loadPersistentCaches(): void {
        const now = Date.now()
        
        try {
            const failures = localStorage.getItem(GameArtworkProvider.FAILURE_CACHE_KEY)
            if (failures) {
                const data = JSON.parse(failures) as Record<string, UrlCacheEntry>
                let count = 0
                for (const [key, entry] of Object.entries(data)) {
                    if (now - entry.timestamp < GameArtworkProvider.CACHE_TTL_MS) {
                        this.failureCache.set(key, entry)
                        count++
                    }
                }
                if (count > 0) GameArtworkProvider.logger.info(`Loaded ${count} cached failures`)
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

/**
 * Handle to artwork for a specific game.
 * Implements GameArtwork interface with lazy loading.
 */
class GameArtworkHandle implements GameArtwork {
    readonly appId: number
    readonly gameName: string
    readonly format: ArtworkFormat
    
    private readonly preferredUrl?: string
    private readonly provider: GameArtworkProvider
    
    private resolvedUrl: string | null = null
    private cachedPixels: PixelDataResult | null = null
    private failureReason: string | null = null
    
    constructor(
        appId: number,
        gameName: string,
        format: ArtworkFormat,
        preferredUrl: string | undefined,
        provider: GameArtworkProvider
    ) {
        this.appId = appId
        this.gameName = gameName
        this.format = format
        this.preferredUrl = preferredUrl
        this.provider = provider
        
        // Check if known failure
        this.failureReason = provider.getFailureReason(appId, format)
    }
    
    getUrl(): string {
        if (this.resolvedUrl) return this.resolvedUrl
        
        // Return first URL from strategy (may not be the one that works)
        const strategy = this.provider.buildUrlStrategy(this.appId, this.format, this.preferredUrl)
        return strategy[0]?.url ?? ''
    }
    
    async getPixels(): Promise<PixelDataResult> {
        const dims = ARTWORK_DIMENSIONS[this.format]
        return this.getPixelsAtSize(dims.width, dims.height)
    }
    
    async getPixelsAtSize(width: number, height: number): Promise<PixelDataResult> {
        // If we already loaded and it's the same size, return cached
        if (this.cachedPixels && 
            this.cachedPixels.width === width && 
            this.cachedPixels.height === height) {
            return this.cachedPixels
        }
        
        // If known failure, throw immediately
        if (this.failureReason) {
            throw new Error(`Known failure for ${this.gameName}: ${this.failureReason}`)
        }
        
        const strategy = this.provider.buildUrlStrategy(this.appId, this.format, this.preferredUrl)
        const triedUrls: string[] = []
        let lastError: Error | null = null
        
        for (const { url, type } of strategy) {
            triedUrls.push(url)
            
            try {
                const result = await this.provider.fetchPixels(
                    url, width, height, `${this.appId}-${this.format}`
                )
                
                this.resolvedUrl = url
                this.cachedPixels = result
                
                // Record success if it was a fallback
                if (type !== 'preferred' && !type.startsWith('cached-')) {
                    this.provider.recordSuccess(this.appId, this.format, url, type)
                }
                
                return result
            } catch (e) {
                lastError = e instanceof Error ? e : new Error(String(e))
            }
        }
        
        // All URLs failed
        this.failureReason = this.categorizeError(lastError?.message ?? 'Unknown error')
        this.provider.recordFailure(this.appId, this.format, this.failureReason, triedUrls)
        
        throw new Error(`Failed to load artwork for ${this.gameName}: ${this.failureReason}`)
    }
    
    async isCached(): Promise<boolean> {
        const strategy = this.provider.buildUrlStrategy(this.appId, this.format, this.preferredUrl)
        for (const { url } of strategy) {
            if (await this.provider.isPixelsCached(url)) {
                return true
            }
        }
        return false
    }
    
    getFailureReason(): string | null {
        return this.failureReason
    }
    
    private categorizeError(msg: string): string {
        const lower = msg.toLowerCase()
        if (lower.includes('cors')) return 'CORS'
        if (lower.includes('404') || lower.includes('not found')) return '404'
        if (lower.includes('timeout') || lower.includes('abort')) return 'TIMEOUT'
        if (lower.includes('network') || lower.includes('failed to fetch')) return 'NETWORK'
        return 'UNKNOWN'
    }
}
