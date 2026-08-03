import { 
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
import { AppDetailsCache } from '../../../steam/cache/AppDetailsCache'
import { Logger } from '../../../utils/Logger'
import { UrlUtils } from '../../../utils/UrlUtils'

/**
 * Handle to artwork for a specific game.
 * Implements GameArtwork interface with lazy loading.
 */
export class GameArtworkRequest implements GameArtwork {
    private static logger = Logger.createLogFunctions(GameArtworkRequest.name)

    readonly appId: number
    readonly gameName: string
    readonly format: ArtworkFormat
    
    private readonly artworkHints?: { library?: string; header?: string }
    private readonly provider: GameArtworkProvider
    
    private resolvedUrl: string | null = null
    private cachedPixels: PixelDataResult | null = null
    private failureReason: FailureReason | null = null
    
    constructor(
        appId: number,
        gameName: string,
        format: ArtworkFormat,
        artworkHints: { library?: string; header?: string } | undefined,
        provider: GameArtworkProvider
    ) {
        this.appId = appId
        this.gameName = gameName
        this.format = format
        this.artworkHints = artworkHints
        this.provider = provider
        
        // Check if known failure
        this.failureReason = provider.getFailureReason(appId, format)
    }
    
    async getPixelsAtSize(width: number, height: number): Promise<PixelDataResult> {
        // If we already loaded and it's the same size, return cached
        if (this.cachedPixels?.width === width &&
            this.cachedPixels.height === height) {
            return this.cachedPixels
        }

        // Zero-network, ahead of everything else - Steam's own already-validated local art beats
        // any URL strategy, guessed or hinted. A miss (no local index entry, no matching slot, or
        // a disk read/decode failure) returns null and falls straight through below - not an error.
        const localResult = await this.provider.fetchPixelsFromLocalDisk(this.appId, this.format, width, height)
        if (localResult) {
            this.cachedPixels = localResult
            return localResult
        }

        const cachedSelection = SteamArtworkStateManager.getState(this.appId)
        if (cachedSelection?.selectedType === 'label') {
            throw new Error(`Resolved label artwork for ${this.gameName}`)
        }

        if (!this.resolvedUrl && cachedSelection?.selectedUrl) {
            this.resolvedUrl = cachedSelection.selectedUrl
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
        const strategy = this.provider.buildUrlStrategy(this.appId, this.format, this.artworkHints)
        const deadPaths = await AppDetailsCache.getDeadArtworkPaths(this.appId)
        const triedUrls: string[] = []
        const skippedDeadUrls: string[] = []
        // Not awaited inline (a candidate's dead-mark write shouldn't delay trying the next
        // candidate) but always drained before this method settles, success or failure - a
        // fire-and-forget write can otherwise lose the race against a fast app-quit right after
        // the resolution that triggered it, silently losing the one thing this cache exists for.
        const pendingDeadMarks: Promise<void>[] = []
        let lastError: Error | null = null

        for (const { url, type } of strategy) {
            // Compare with the `?t=` cache-buster stripped - see AppDetailsCache.markArtworkPathDead.
            if (deadPaths.has(UrlUtils.stripQueryParam(url, 't'))) {
                skippedDeadUrls.push(url)
                continue
            }

            triedUrls.push(url)
            const route = this.classifyRoute(url, type)

            try {
                const result = await this.provider.fetchPixels(
                    url, width, height, `${this.appId}-${this.format}`
                )

                this.recordSuccessfulResolution(result, url, type, route)
                await Promise.allSettled(pendingDeadMarks)
                return result
            } catch (e) {
                lastError = e instanceof Error ? e : new Error(String(e))
                pendingDeadMarks.push(
                    AppDetailsCache.markArtworkPathDead(this.appId, url).catch(() => { /* best-effort persistence */ })
                )
            }
        }

        await Promise.allSettled(pendingDeadMarks)

        // All URLs failed, or were already known-dead from a prior session - categorize and record
        const rawErrorMessage = lastError?.message
            ?? (skippedDeadUrls.length > 0 ? 'All candidates previously failed' : 'Unknown error')
        this.failureReason = lastError ? this.categorizeError(rawErrorMessage, triedUrls) : 'NO_ARTWORK'
        this.provider.recordFailure(this.appId, this.format, this.failureReason, [...triedUrls, ...skippedDeadUrls])
        this.setArtworkSelection('label')

        // No per-occurrence log here - GameArtworkProvider.logRunSummary() reports the aggregate
        // once the whole prefetch queue settles; recordFailure() just above already stores
        // triedUrls/skippedDeadUrls for a specific game's own inspection.
        throw new Error(`Failed to load artwork for ${this.gameName}: ${this.failureReason}`)
    }

    private recordSuccessfulResolution(
        result: PixelDataResult,
        url: string,
        type: string,
        route: CdnArtworkType | 'other'
    ): void {
        const alreadyResolved = this.resolvedUrl === url
        this.resolvedUrl = url
        this.cachedPixels = result

        if (type !== 'preferred' && !type.startsWith('cached-')) {
            this.provider.recordSuccess(this.appId, this.format, url, type)
        }

        // First-time resolution only (getPixelsAtSize can re-enter per LOD size), so a session's
        // resolved count is directly comparable against the failed count and placement totals.
        if (!alreadyResolved) {
            GameArtworkRequest.logger.debug(
                `Artwork resolved for appId ${this.appId} (${this.gameName}): route=${route}; url=${url}`
            )
        }

        if (this.isCdnArtworkType(route)) {
            this.setArtworkSelection(route, url)
        }
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
