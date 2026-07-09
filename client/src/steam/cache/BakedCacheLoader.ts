/**
 * Seeds AppDetailsCache from the static bundles produced by
 * scripts/repack-steam-cache.sh (release.sh Step 2) - client/public/steam-cache/.
 *
 * Fetches the small free-to-play bundle first so the anonymous store can
 * render immediately, then the larger "rest" bundle in the background.
 * If IndexedDB already has entries, skips entirely - see docs/plans/release-pipeline-plan.md
 * for why this coarse check is a placeholder, not the real cache-buster.
 */

import type { AppDetailsData } from '../batch/BatchAppDetailsClient'
import { AppDetailsCache } from './AppDetailsCache'
import { Logger } from '../../utils/Logger'

interface BakedCacheEntry {
    success: boolean
    appid: number
    data: AppDetailsData
    retrieved_at: string
}

interface BakedCacheBundle {
    generated_at: string
    games: Record<string, BakedCacheEntry>
}

interface BakedCacheTier {
    label: string
    path: string
}

const BAKED_CACHE_TIERS: readonly BakedCacheTier[] = [
    { label: 'f2p', path: '/steam-cache/app-details-f2p.json.gz' },
    { label: 'rest', path: '/steam-cache/app-details-rest.json.gz' },
]

export class BakedCacheLoader {
    private static readonly logger = Logger.createLogFunctions(BakedCacheLoader.name)
    private readonly appDetailsCache: AppDetailsCache

    constructor(appDetailsCache: AppDetailsCache) {
        this.appDetailsCache = appDetailsCache
    }

    /**
     * Seed the cache from baked bundles, unless IndexedDB already has data.
     * Fire-and-forget from the caller - never blocks scene startup.
     */
    async seedIfNeeded(): Promise<void> {
        const stats = await this.appDetailsCache.getStats()
        if (stats.count > 0) {
            BakedCacheLoader.logger.debug(`Skipping baked cache: IndexedDB already has ${stats.count} entries`)
            return
        }

        BakedCacheLoader.logger.info('No existing app-details cache found - seeding from baked release bundles')
        for (const tier of BAKED_CACHE_TIERS) {
            await this.seedTier(tier)
        }
    }

    private async seedTier(tier: BakedCacheTier): Promise<void> {
        BakedCacheLoader.logger.debug(`Fetching baked cache tier "${tier.label}" from ${tier.path}`)

        let response: Response
        try {
            response = await fetch(tier.path)
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error))
            BakedCacheLoader.logger.warn(
                `Baked cache tier "${tier.label}" fetch rejected before any response arrived ` +
                `(${err.name}: ${err.message}). This means the request never completed - not a ` +
                `404/missing file (those are handled separately below). Likely causes: offline/` +
                `throttled network or a browser extension blocking the request.`
            )
            return
        }

        if (!response.ok) {
            // Covers both "file genuinely missing" (404) and transient server errors (observed:
            // intermittent 503 from the Vite dev server under full-page-reload request bursts -
            // reproduced only under rapid automated reloads, not realistic single-navigation use,
            // and not expected against a production static host or Tauri's asset protocol).
            // Either way, falling through to the normal Lambda-backed fetch path is correct.
            BakedCacheLoader.logger.debug(`Baked cache tier "${tier.label}" unavailable (HTTP ${response.status}) - skipping`)
            return
        }
        if (!response.body) {
            BakedCacheLoader.logger.warn(`Baked cache tier "${tier.label}" response has no body - skipping`)
            return
        }

        try {
            const decompressed = response.body.pipeThrough(new DecompressionStream('gzip'))
            const text = await new Response(decompressed).text()
            const bundle = JSON.parse(text) as BakedCacheBundle

            const dataMap = new Map<number, AppDetailsData>(
                Object.values(bundle.games).map(entry => [entry.appid, entry.data])
            )

            BakedCacheLoader.logger.debug(
                `Parsed baked cache tier "${tier.label}": ${dataMap.size} games (generated_at: ${bundle.generated_at})`
            )

            await this.appDetailsCache.setMany(dataMap)

            BakedCacheLoader.logger.info(
                `Seeded ${dataMap.size} games from baked cache tier "${tier.label}"`
            )
        } catch (error) {
            BakedCacheLoader.logger.warn(`Failed to parse/seed baked cache tier "${tier.label}":`, error)
        }
    }
}
