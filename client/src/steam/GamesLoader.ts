import { CacheManager } from './cache/SimpleCacheManager'
import { BatchAppDetailsClient, type AppDetailsData } from './batch/BatchAppDetailsClient'
import { AppDetailsCache } from './cache/AppDetailsCache'
import { Logger } from '../utils/Logger'
import { PerformanceMonitor, ASYNC_CONTEXT, MAIN_THREAD_CONTEXT } from '../utils/PerformanceMonitor'
import { EventManager } from '../core/EventManager'
import { SteamEventTypes } from '../types/InteractionEvents'
import type { SteamGamesBatchEvent, SteamNetworkFetchProgressEvent } from '../types/InteractionEvents'
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
     * Load games with single-pass cache check and fetch
     *
     * Games are emitted progressively as they become available:
     * - Cached games are enhanced and emitted immediately
     * - Uncached games are fetched from the network and emitted as each
     *   network batch (100 games) resolves
     *
     * Both paths feed the same progressive emitter so there is no
     * bifurcation of batch emission logic.
     */
    public async loadGamesProgressively(
        steamUser: SteamUser,
        options: {
            maxGames?: number
            /** Optional comparator to override default playtime-descending sort. */
            sortFn?: (a: SteamGame, b: SteamGame) => number
        } = {}
    ): Promise<SteamGame[]> {
        const { maxGames = 9999, sortFn } = options
        const BATCH_SIZE = 18 // One shelf's worth

        const sortedGames = this.sortAndLimitGames(steamUser.games, maxGames, sortFn)
        const appids = sortedGames.map(g => g.appid)

        const { cachedAppids, uncachedAppids, cachedAppDetails } = await this.partitionByCache(appids)

        const cachedBatchCount = Math.ceil(cachedAppids.length / BATCH_SIZE)
        const uncachedBatchCount = Math.ceil(uncachedAppids.length / BATCH_SIZE)
        const totalBatchCount = cachedBatchCount + uncachedBatchCount

        // Shared progressive emitter — both paths push games through this.
        let pendingGames: SteamGame[] = []
        let renderBatchIndex = 0

        const flush = async (force = false) => {
            while (pendingGames.length >= BATCH_SIZE || (force && pendingGames.length > 0)) {
                const batch = pendingGames.splice(0, BATCH_SIZE)
                EventManager.getInstance().emit<SteamGamesBatchEvent>(SteamEventTypes.GamesBatchReady, {
                    games: batch as ReadonlyArray<Readonly<SteamGame>>,
                    batchIndex: renderBatchIndex,
                    totalBatches: totalBatchCount
                })
                renderBatchIndex++
                await new Promise(resolve => setTimeout(resolve, 0))
            }
        }

        const cachedGames = await this.buildCachedEnhancedGames(sortedGames, cachedAppids, cachedAppDetails, pendingGames, flush)

        // Flush any partial remainder from the cached phase before uncached games start.
        if (uncachedAppids.length > 0) {
            await flush(true)
        }

        // Emit network fetch progress so the UI can show a loading indicator
        if (uncachedAppids.length > 0) {
            EventManager.getInstance().emit<SteamNetworkFetchProgressEvent>(SteamEventTypes.NetworkFetchProgress, {
                fetched: cachedAppids.length,
                total: sortedGames.length
            })
        }

        // PHASE 2: Uncached games
        if (uncachedAppids.length > 0) {
            const gameByAppid = new Map<number, SteamGame>(sortedGames.map(g => [g.appid, g]))
            this.fetchAndEmitUncached(uncachedAppids, gameByAppid, cachedBatchCount, renderBatchIndex, pendingGames, flush)
        } else {
            // All games were cached — flush remainder now
            await flush(true)
        }

        this.logger.info(`Loaded ${cachedGames.length} cached games, ${uncachedAppids.length} fetching in background`)
        return cachedGames
    }

    private async buildCachedEnhancedGames(
        sortedGames: SteamGame[],
        cachedAppids: number[],
        cachedAppDetails: Map<number, AppDetailsData>,
        pendingGames: SteamGame[],
        flush: (force?: boolean) => Promise<void>
    ): Promise<SteamGame[]> {
        const buildMonitor = PerformanceMonitor.start('build-cached-games', this.logger, MAIN_THREAD_CONTEXT)
        const cachedGames = sortedGames.filter(g => cachedAppids.includes(g.appid))
        for (const game of cachedGames) {
            const enhanced = this.buildEnhancedGame(game, cachedAppDetails.get(game.appid))
            this.cache.set(`game_${game.appid}`, enhanced)
            pendingGames.push(enhanced)
            await flush()
        }
        buildMonitor.end({ count: cachedGames.length })
        return cachedGames
    }

    private fetchAndEmitUncached(
        uncachedAppids: number[],
        gameByAppid: Map<number, SteamGame>,
        cachedBatchCount: number,
        renderBatchIndex: number,
        pendingGames: SteamGame[],
        flush: (force?: boolean) => Promise<void>
    ): void {
        const fetchedAppDetails = new Map<number, AppDetailsData>()

        // Run in background; unhandled rejection is caught and logged
        this.batchClient.fetchBatch(uncachedAppids, { batchSize: 100 })
            .then(async (batchResponses) => {
                for (const [appid, response] of batchResponses.entries()) {
                    const dataToNormalize = response.success === false && response.unlisted
                        ? (response as unknown as AppDetailsData)
                        : response.data
                    const normalized = this.normalizeBatchData(dataToNormalize)
                    fetchedAppDetails.set(appid, normalized)

                    const baseGame = gameByAppid.get(appid)
                    if (!baseGame) continue

                    const enhanced = this.buildEnhancedGame(baseGame, normalized)
                    this.cache.set(`game_${appid}`, enhanced)
                    pendingGames.push(enhanced)
                    await flush()
                }

                // Flush any remaining partial shelf
                await flush(true)

                if (fetchedAppDetails.size > 0) {
                    const cacheMonitor = PerformanceMonitor.start('cache-metadata', this.logger, ASYNC_CONTEXT)
                    await this.appDetailsCache.setMany(fetchedAppDetails)
                    cacheMonitor.end({ count: fetchedAppDetails.size })
                }

                this.logger.info(
                    `[ASYNC] Emitted ${fetchedAppDetails.size} uncached games progressively in ${renderBatchIndex - cachedBatchCount} rendering batches`
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
        cachedAppids: number[]
        uncachedAppids: number[]
        cachedAppDetails: Map<number, AppDetailsData>
    }> {
        const cachedAppDetails = await this.appDetailsCache.getMany(appids)
        const cachedAppids = appids.filter(id => this.isMetadataComplete(cachedAppDetails.get(id)))
        const uncachedAppids = appids.filter(id => !this.isMetadataComplete(cachedAppDetails.get(id)))
        
        if (uncachedAppids.length === 0) {
            this.logger.debug(`All ${appids.length} games have complete metadata in cache`)
        } else {
            this.logger.info(`Loading ${appids.length} games: ${cachedAppids.length} cached, ${uncachedAppids.length} to fetch`)
        }
        
        return { cachedAppids, uncachedAppids, cachedAppDetails }
    }

    private isMetadataComplete(cached: AppDetailsData | undefined): boolean {
        if (!cached) return false
        const hasCategories = cached.categories && Array.isArray(cached.categories) && cached.categories.length > 0
        const hasGenres = cached.genres && Array.isArray(cached.genres) && cached.genres.length > 0
        return hasCategories || hasGenres
    }

    private normalizeBatchData(data: AppDetailsData): AppDetailsData {
        // Handle negative caching shells gracefully (data might be undefined or missing fields)
        if (!data) return {} as AppDetailsData;
        
        const fullData = data.full_data as Record<string, unknown> | undefined
        return {
            ...data,
            categories: data.categories || (fullData?.categories as AppDetailsData['categories']),
            genres: data.genres || (fullData?.genres as AppDetailsData['genres']),
            developers: data.developers || (fullData?.developers as string[]),
            publishers: data.publishers || (fullData?.publishers as string[]),
            release_date: data.release_date || (fullData?.release_date as AppDetailsData['release_date']),
            metacritic: data.metacritic || (fullData?.metacritic as AppDetailsData['metacritic']),
            // Lift SteamSpy fields if present in full_data
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
            // Use SteamSpy name if base name is empty or missing
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
