import { CacheManager } from './cache/SimpleCacheManager'
import { BatchAppDetailsClient, type AppDetailsData } from './batch/BatchAppDetailsClient'
import { AppDetailsCache, type AppDetailsCacheResult } from './cache/AppDetailsCache'
import { Logger } from '../utils/Logger'
import { PerformanceMonitor, ASYNC_CONTEXT, MAIN_THREAD_CONTEXT } from '../utils/PerformanceMonitor'
import { EventManager } from '../core/EventManager'
import { SteamEventTypes } from '../types/InteractionEvents'
import type {
    SteamGamesBatchEvent,
    SteamNetworkFetchProgressEvent,
    SteamLibraryManifestReadyEvent,
} from '../types/InteractionEvents'
import type { SteamGame, SteamUser } from './SteamApiClient'

export class GamesLoader {
    private appDetailsCache: AppDetailsCache
    private cache: CacheManager
    private batchClient: BatchAppDetailsClient
    private logger: ReturnType<typeof Logger.createLogFunctions>

    constructor(
        appDetailsCache: AppDetailsCache,
        cache: CacheManager,
        batchClient: BatchAppDetailsClient,
        logger: ReturnType<typeof Logger.createLogFunctions>
    ) {
        this.appDetailsCache = appDetailsCache
        this.cache = cache
        this.batchClient = batchClient
        this.logger = logger
    }

    /**
     * Load games with single-pass cache check and fetch.
     *
     * Cached games are enhanced and emitted immediately in shelf-sized batches.
     * Uncached games are fetched from the network in the background and emitted
     * as their responses arrive, using the same emitter so batch indices are
     * perfectly sequential.
     */
    public async loadGamesProgressively(
        steamUser: SteamUser,
        options: {
            maxGames?: number
            sortFn?: (a: SteamGame, b: SteamGame) => number
        } = {}
    ): Promise<SteamGame[]> {
        const { maxGames = 9999, sortFn } = options
        const BATCH_SIZE = 18 // One shelf's worth

        const sortedGames = this.sortAndLimitGames(steamUser.games, maxGames, sortFn)
        const appids = sortedGames.map(g => g.appid)

        const { renderableAppids, refreshAppids, renderableAppDetails, staleAppids } = await this.partitionByCache(appids)

        const renderableBatchCount = Math.ceil(renderableAppids.length / BATCH_SIZE)
        const refreshBatchCount = Math.ceil(refreshAppids.length / BATCH_SIZE)
        const totalBatchCount = renderableBatchCount + refreshBatchCount

        EventManager.getInstance().emit<SteamLibraryManifestReadyEvent>(SteamEventTypes.LibraryManifestReady, {
            totalGames: sortedGames.length,
            totalBatches: totalBatchCount,
            appids,
        })

        const emitter = new BatchEmitter(BATCH_SIZE, totalBatchCount)

        const renderableGames = await this.emitCachedGames(sortedGames, renderableAppids, renderableAppDetails, emitter)

        // Flush any partial remainder before refresh fetches start — keeps batch
        // indices perfectly sequential when the two phases interleave.
        if (refreshAppids.length > 0) {
            await emitter.flush()
        }

        if (refreshAppids.length > 0) {
            EventManager.getInstance().emit<SteamNetworkFetchProgressEvent>(SteamEventTypes.NetworkFetchProgress, {
                fetched: renderableAppids.length,
                total: sortedGames.length
            })
            const gameByAppid = new Map<number, SteamGame>(sortedGames.map(g => [g.appid, g]))
            this.fetchAndEmitUncached(refreshAppids, gameByAppid, renderableBatchCount, emitter)
        } else {
            await emitter.flush()
        }

        this.logger.info(
            `Loaded ${renderableGames.length} renderable games (${staleAppids.length} stale), ${refreshAppids.length} refreshing in background`
        )
        return renderableGames
    }

    private async emitCachedGames(
        sortedGames: SteamGame[],
        cachedAppids: number[],
        cachedAppDetails: Map<number, AppDetailsData>,
        emitter: BatchEmitter
    ): Promise<SteamGame[]> {
        const monitor = PerformanceMonitor.start('build-cached-games', this.logger, MAIN_THREAD_CONTEXT)
        const cachedGames = sortedGames.filter(g => cachedAppids.includes(g.appid))
        for (const game of cachedGames) {
            const enhanced = this.buildEnhancedGame(game, cachedAppDetails.get(game.appid))
            this.cache.set(`game_${game.appid}`, enhanced)
            await emitter.push(enhanced)
        }
        monitor.end({ count: cachedGames.length })
        return cachedGames
    }

    private fetchAndEmitUncached(
        uncachedAppids: number[],
        gameByAppid: Map<number, SteamGame>,
        cachedBatchCount: number,
        emitter: BatchEmitter
    ): void {
        const fetchedAppDetails = new Map<number, AppDetailsData>()

        this.batchClient.fetchBatch(uncachedAppids, { batchSize: 100 })
            .then(async (batchResponses) => {
                for (const [appid, response] of batchResponses.entries()) {
                    const rawData = response.success === false && response.unlisted
                        ? (response as unknown as AppDetailsData)
                        : response.data
                    const normalized = this.normalizeBatchData(rawData)
                    fetchedAppDetails.set(appid, normalized)

                    const baseGame = gameByAppid.get(appid)
                    if (!baseGame) continue

                    const enhanced = this.buildEnhancedGame(baseGame, normalized)
                    this.cache.set(`game_${appid}`, enhanced)
                    await emitter.push(enhanced)
                }

                await emitter.flush()

                if (fetchedAppDetails.size > 0) {
                    const cacheMonitor = PerformanceMonitor.start('cache-metadata', this.logger, ASYNC_CONTEXT)
                    await this.appDetailsCache.setMany(fetchedAppDetails)
                    cacheMonitor.end({ count: fetchedAppDetails.size })
                }

                this.logger.info(
                    `[ASYNC] Emitted ${fetchedAppDetails.size} uncached games in ${emitter.batchIndex - cachedBatchCount} rendering batches`
                )
            })
            .catch(error => {
                this.logger.error('[ASYNC] Background metadata fetch failed:', error)
            })
    }

    private sortAndLimitGames(games: SteamGame[], maxGames: number, sortFn?: (a: SteamGame, b: SteamGame) => number): SteamGame[] {
        const comparator = sortFn ?? ((a: SteamGame, b: SteamGame) => (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0))
        return [...games]
            .sort(comparator)
            .slice(0, maxGames)
    }

    private async partitionByCache(appids: number[]): Promise<{
        renderableAppids: number[]
        refreshAppids: number[]
        renderableAppDetails: Map<number, AppDetailsData>
        staleAppids: number[]
    }> {
        const cachedAppDetails = await this.appDetailsCache.getMany(appids)
        const renderableAppDetails = new Map<number, AppDetailsData>()
        const renderableAppids: number[] = []
        const staleAppids: number[] = []
        const refreshAppids: number[] = []

        for (const appid of appids) {
            this.processCacheResult(
                appid,
                cachedAppDetails.get(appid) as AppDetailsCacheResult | undefined,
                renderableAppids,
                refreshAppids,
                renderableAppDetails,
                staleAppids
            )
        }

        this.logPartitionResults(appids.length, renderableAppids.length, staleAppids.length, refreshAppids.length)

        return { renderableAppids, refreshAppids, renderableAppDetails, staleAppids }
    }

    private processCacheResult(
        appid: number,
        cachedResult: AppDetailsCacheResult | undefined,
        renderableAppids: number[],
        refreshAppids: number[],
        renderableAppDetails: Map<number, AppDetailsData>,
        staleAppids: number[]
    ): void {
        if (!cachedResult) {
            refreshAppids.push(appid)
            return
        }

        const normalizedCachedData = this.normalizeBatchData(cachedResult)
        if (this.isMetadataComplete(normalizedCachedData)) {
            renderableAppids.push(appid)
            renderableAppDetails.set(appid, normalizedCachedData)

            if (cachedResult.isStale) {
                staleAppids.push(appid)
                refreshAppids.push(appid)
            }
        } else {
            refreshAppids.push(appid)
        }
    }

    private logPartitionResults(total: number, renderable: number, stale: number, refresh: number): void {
        if (refresh === 0) {
            this.logger.debug(`All ${total} games have complete metadata in cache (0 stale)`)
        } else {
            this.logger.info(
                `Loading ${total} games: ${renderable} renderable (${stale} stale), ${refresh} to refresh`
            )
        }
    }

    private isMetadataComplete(cached: AppDetailsData | undefined): boolean {
        if (!cached) return false
        const hasCategories = cached.categories && Array.isArray(cached.categories) && cached.categories.length > 0
        const hasGenres = cached.genres && Array.isArray(cached.genres) && cached.genres.length > 0
        return hasCategories || hasGenres
    }

    private normalizeBatchData(data: AppDetailsData): AppDetailsData {
        if (!data) return {} as AppDetailsData
        const fullData = data.full_data as Record<string, unknown> | undefined
        return {
            ...data,
            categories: data.categories || (fullData?.categories as AppDetailsData['categories']),
            genres: data.genres || (fullData?.genres as AppDetailsData['genres']),
            developers: data.developers || (fullData?.developers as string[]),
            publishers: data.publishers || (fullData?.publishers as string[]),
            release_date: data.release_date || (fullData?.release_date as AppDetailsData['release_date']),
            metacritic: data.metacritic || (fullData?.metacritic as AppDetailsData['metacritic']),
            steamspy_tags: data.steamspy_tags || (fullData?.tags as Record<string, number>),
            positive: data.positive || (fullData?.positive as number),
            negative: data.negative || (fullData?.negative as number),
            userscore: data.userscore || (fullData?.userscore as number),
            owners: data.owners || (fullData?.owners as string)
        }
    }

    private buildEnhancedGame(game: SteamGame, appDetails: AppDetailsData | undefined): SteamGame {
        const headerUrl = appDetails?.artwork?.header
            || appDetails?.artwork?.capsule_v5
            || appDetails?.artwork?.capsule
            || `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`

        return {
            ...game,
            name: appDetails?.name && appDetails.name !== 'Unknown Game' ? appDetails.name : game.name,
            artwork: {
                icon: game.img_icon_url
                    ? `https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`
                    : '',
                logo: game.img_logo_url
                    ? `https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/${game.appid}/${game.img_logo_url}.jpg`
                    : '',
                header: headerUrl,
                library: `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/library_600x900.jpg`
            },
            categories: appDetails?.categories,
            genres: appDetails?.genres,
            developers: appDetails?.developers,
            publishers: appDetails?.publishers,
            release_date: appDetails?.release_date,
            metacritic: appDetails?.metacritic,
            short_description: appDetails?.short_description,
            steamspy_tags: appDetails?.steamspy_tags,
            positive: appDetails?.positive,
            negative: appDetails?.negative,
            userscore: appDetails?.userscore,
            owners: appDetails?.owners
        }
    }
}

/**
 * Accumulates games and emits `GamesBatchReady` events in shelf-sized batches.
 *
 * `push(game)` adds a game; if the buffer hits `batchSize`, a batch is emitted
 * and the main thread yielded before returning.
 * `flush()` drains any remainder as a final partial batch.
 *
 * Both are async only because of the yield-to-main-thread between batches —
 * not because emission itself is async.
 */
class BatchEmitter {
    private readonly buffer: SteamGame[] = []
    private readonly batchSize: number
    private readonly totalBatches: number
    private _batchIndex: number = 0

    constructor(batchSize: number, totalBatches: number) {
        this.batchSize = batchSize
        this.totalBatches = totalBatches
    }

    /** Current number of batches emitted (readable by callers for logging). */
    get batchIndex(): number {
        return this._batchIndex
    }

    /** Add a game. Emits a batch and yields the main thread if the buffer is full. */
    async push(game: SteamGame): Promise<void> {
        this.buffer.push(game)
        if (this.buffer.length >= this.batchSize) {
            await this.emitBatch()
        }
    }

    /** Drain any remaining games as a partial batch. No-op if buffer is empty. */
    async flush(): Promise<void> {
        if (this.buffer.length > 0) {
            await this.emitBatch()
        }
    }

    private async emitBatch(): Promise<void> {
        const batch = this.buffer.splice(0, this.batchSize)
        EventManager.getInstance().emit<SteamGamesBatchEvent>(SteamEventTypes.GamesBatchReady, {
            games: batch as ReadonlyArray<Readonly<SteamGame>>,
            batchIndex: this._batchIndex,
            totalBatches: this.totalBatches
        })
        this._batchIndex++
        // Yield the main thread between batches so rendering isn't starved.
        await new Promise(resolve => setTimeout(resolve, 0))
    }
}
