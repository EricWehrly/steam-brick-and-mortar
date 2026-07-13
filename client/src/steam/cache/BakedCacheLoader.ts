/**
 * Seeds AppDetailsCache from the static bundle produced by
 * scripts/repack-steam-cache.sh (release.sh Step 2) - client/public/steam-cache/app-details.json.gz.
 *
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

const BAKED_CACHE_BUNDLE_PATH = '/steam-cache/app-details.json.gz'

export class BakedCacheLoader {
    private static readonly logger = Logger.createLogFunctions(BakedCacheLoader.name)
    private readonly appDetailsCache: AppDetailsCache

    constructor(appDetailsCache: AppDetailsCache) {
        this.appDetailsCache = appDetailsCache
    }

    /**
     * Seed the cache from the baked bundle, unless IndexedDB already has data.
     * Fire-and-forget from the caller - never blocks scene startup.
     */
    async seedIfNeeded(): Promise<void> {
        const stats = await this.appDetailsCache.getStats()
        if (stats.count > 0) {
            BakedCacheLoader.logger.debug(`Skipping baked cache: IndexedDB already has ${stats.count} entries`)
            return
        }

        BakedCacheLoader.logger.info('No existing app-details cache found - seeding from baked release bundle')
        await this.seedBundle()
    }

    private async seedBundle(): Promise<void> {
        BakedCacheLoader.logger.debug(`Fetching baked cache bundle from ${BAKED_CACHE_BUNDLE_PATH}`)

        let response: Response
        try {
            response = await fetch(BAKED_CACHE_BUNDLE_PATH)
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error))
            BakedCacheLoader.logger.warn(
                `Baked cache bundle fetch rejected before any response arrived ` +
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
            BakedCacheLoader.logger.debug(`Baked cache bundle unavailable (HTTP ${response.status}) - skipping`)
            return
        }
        if (!response.body) {
            BakedCacheLoader.logger.warn(`Baked cache bundle response has no body - skipping`)
            return
        }

        try {
            // Some static hosts (observed: this project's Vite dev server) recognize the .gz
            // extension and serve these files with Content-Encoding: gzip set. fetch() then
            // transparently decompresses the body before we ever see it, leaving response.body
            // as plain JSON already - piping that through another DecompressionStream fails
            // ("incorrect header check", since JSON bytes aren't a valid gzip magic number).
            // Other hosts serve the raw gzip bytes opaquely (no Content-Encoding, or
            // Content-Encoding: identity) and expect us to decompress client-side, which is the
            // whole point of shipping .gz files instead of a bigger plain .json. Branch on the
            // header actually observed rather than assuming either behavior.
            const alreadyDecompressed = response.headers.get('content-encoding')?.toLowerCase() === 'gzip'
            const text = alreadyDecompressed
                ? await response.text()
                : await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).text()
            const bundle = JSON.parse(text) as BakedCacheBundle

            const dataMap = new Map<number, AppDetailsData>(
                Object.values(bundle.games).map(entry => [entry.appid, entry.data])
            )

            BakedCacheLoader.logger.debug(
                `Parsed baked cache bundle: ${dataMap.size} games (generated_at: ${bundle.generated_at})`
            )

            await this.appDetailsCache.setMany(dataMap)

            BakedCacheLoader.logger.info(`Seeded ${dataMap.size} games from baked cache bundle`)
        } catch (error) {
            BakedCacheLoader.logger.warn(`Failed to parse/seed baked cache bundle:`, error)
        }
    }
}
