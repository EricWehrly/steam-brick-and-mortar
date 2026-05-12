import { 
    ARTWORK_DIMENSIONS, 
    GameArtworkProvider 
} from './GameArtworkProvider'
import type { 
    GameArtwork, 
    ArtworkFormat, 
    CdnArtworkType,
    FailureReason, 
    PixelDataResult 
} from './GameArtworkProvider'
import { SteamArtworkStateManager } from '../../../core/data/SteamArtworkStateManager'

/**
 * Handle to artwork for a specific game.
 * Implements GameArtwork interface with lazy loading.
 */
export class GameArtworkRequest implements GameArtwork {
    readonly appId: number
    readonly gameName: string
    readonly format: ArtworkFormat
    
    private readonly preferredUrl?: string
    private readonly provider: GameArtworkProvider
    
    private resolvedUrl: string | null = null
    private cachedPixels: PixelDataResult | null = null
    private failureReason: FailureReason | null = null
    
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
    
    async getPixelsAtSize(width: number, height: number): Promise<PixelDataResult> {
        // If we already loaded and it's the same size, return cached
        if (this.cachedPixels?.width === width && 
            this.cachedPixels.height === height) {
            return this.cachedPixels
        }

        const strategyUrls = this.provider
            .buildUrlStrategy(this.appId, this.format, this.preferredUrl)
            .map((entry) => entry.url)
        
        // Check if this is a permanent failure we should skip
        if (this.provider.shouldSkipPermanentFailureForUrls(this.appId, this.format, strategyUrls)) {
            const reason = this.failureReason ?? this.provider.getFailureReason(this.appId, this.format)
            if (reason) {
                this.provider.recordSkip(this.appId, this.gameName, reason)
            }
            throw new Error(`Permanent failure (${reason}) - skipping retry`)
        }
        
        // Known non-permanent failures should be retried.
        // They are historical hints, not hard blocks.

        const pinnedResult = await this.fetchFromResolvedUrl(width, height)
        if (pinnedResult) {
            return pinnedResult
        }

        return this.fetchFromStrategy(width, height)
    }

    private async fetchFromResolvedUrl(width: number, height: number): Promise<PixelDataResult | null> {
        if (!this.resolvedUrl) {
            return null
        }

        // Keep one artwork source URL per request handle to avoid MID/HIGH LOD image swapping.
        try {
            const result = await this.provider.fetchPixels(
                this.resolvedUrl,
                width,
                height,
                `${this.appId}-${this.format}`
            )

            this.cachedPixels = result

            const pinnedRoute = this.classifyRoute(this.resolvedUrl, 'resolved')
            if (this.isCdnArtworkType(pinnedRoute)) {
                this.setArtworkSelection(pinnedRoute, this.resolvedUrl)
            }

            return result
        } catch {
            this.resolvedUrl = null
            return null
        }
    }

    private async fetchFromStrategy(width: number, height: number): Promise<PixelDataResult> {
        const strategy = this.provider.buildUrlStrategy(this.appId, this.format, this.preferredUrl)
        const triedUrls: string[] = []
        let lastError: Error | null = null
        
        for (const { url, type } of strategy) {
            triedUrls.push(url)
            const route = this.classifyRoute(url, type)
            
            try {
                const result = await this.provider.fetchPixels(
                    url, width, height, `${this.appId}-${this.format}`
                )

                this.recordSuccessfulResolution(result, url, type, route)
                return result
            } catch (e) {
                lastError = e instanceof Error ? e : new Error(String(e))
            }
        }
        
        // All URLs failed - categorize and record
        this.failureReason = this.categorizeError(lastError?.message ?? 'Unknown error', triedUrls)
        this.provider.recordFailure(this.appId, this.format, this.failureReason, triedUrls)
        this.setArtworkSelection('label')

        throw new Error(`Failed to load artwork for ${this.gameName}: ${this.failureReason}`)
    }

    private recordSuccessfulResolution(
        result: PixelDataResult,
        url: string,
        type: string,
        route: CdnArtworkType | 'other'
    ): void {
        this.resolvedUrl = url
        this.cachedPixels = result

        if (type !== 'preferred' && !type.startsWith('cached-')) {
            this.provider.recordSuccess(this.appId, this.format, url, type)
        }

        if (this.isCdnArtworkType(route)) {
            this.setArtworkSelection(route, url)
        }
    }
    
    async isCached(): Promise<boolean> {
        const strategy = this.provider.buildUrlStrategy(this.appId, this.format, this.preferredUrl)
        const dims = ARTWORK_DIMENSIONS[this.format]
        for (const { url } of strategy) {
            if (await this.provider.isPixelsCached(url, dims.width, dims.height)) {
                return true
            }
        }
        return false
    }
    
    getFailureReason(): FailureReason | null {
        return this.failureReason
    }
    
    private categorizeError(msg: string, urlsTried: string[]): FailureReason {
        const lower = msg.toLowerCase()

        // CORS detection.
        // Firefox:  "TypeError: NetworkError when attempting to fetch resource."
        // Chrome:   "TypeError: Failed to fetch" (with no status) / "has been blocked by CORS policy"
        // Both:     fetch with mode:'cors' throws a TypeError — NOT an HTTP error — so response.status
        //           is never readable. We infer CORS from message patterns.
        if (lower.includes('cors') ||
            lower.includes('cross-origin') ||
            lower.includes('opaque') ||
            lower.includes('networkerror when attempting to fetch')) {
            return 'CORS'
        }
        
        // Decode/format errors
        if (lower.includes('decode') || lower.includes('invalid image')) return 'DECODE'
        
        // Timeouts
        if (lower.includes('timeout') || lower.includes('abort')) return 'TIMEOUT'
        
        // HTTP 404: worker throws 'HTTP 404: Not Found' when response is accessible.
        // When the CDN returns 404 WITH valid CORS headers we can read the status.
        // When it returns 404 WITHOUT CORS headers, CORS fires first (see above).
        // Treat any 404 as permanent — the artwork doesn't exist on the CDN.
        if (lower.includes('http 404') || lower.includes('404') || lower.includes('not found')) {
            return '404'
        }
        
        // Generic network errors not matching CORS patterns above.
        if (lower.includes('network') || lower.includes('failed to fetch')) return 'NETWORK'
        
        return 'UNKNOWN'
    }

    private classifyRoute(url: string, type: string): CdnArtworkType | 'other' {
        if (type.includes('library') || url.includes('library_600x900.jpg')) return 'library'
        if (type.includes('capsule') || url.includes('capsule_616x353.jpg')) return 'capsule'
        if (type.includes('header') || url.includes('header.jpg')) return 'header'
        return 'other'
    }

    private isCdnArtworkType(route: CdnArtworkType | 'other'): route is CdnArtworkType {
        return route === 'library' || route === 'capsule' || route === 'header'
    }

    private setArtworkSelection(selectedType: CdnArtworkType | 'label', selectedUrl?: string): void {
        const currentType = SteamArtworkStateManager.getState(this.appId)?.selectedType

        // Never let a later failure path overwrite a successful artwork selection.
        // This can happen when multiple request handles exist for the same game.
        if (selectedType === 'label' && currentType && currentType !== 'label') {
            return
        }

        SteamArtworkStateManager.setSelection(this.appId, selectedType, selectedUrl)
    }
}
