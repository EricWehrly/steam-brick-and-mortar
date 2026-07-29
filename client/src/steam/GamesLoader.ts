import { CacheManager } from './cache/SimpleCacheManager'
import { BatchAppDetailsClient, type AppDetailsData, type AppDetailsResponse } from './batch/BatchAppDetailsClient'
import { AppDetailsCache, type AppDetailsCacheResult } from './cache/AppDetailsCache'
import { Logger } from '../utils/Logger'
import { PerformanceMonitor, ASYNC_CONTEXT, MAIN_THREAD_CONTEXT } from '../utils/PerformanceMonitor'
import { EventManager } from '../core/EventManager'
import { SteamEventTypes } from '../types/InteractionEvents'
import { getTopSteamSpyTags } from './utils/SteamSpyTags'
import { deriveArtworkFromAppId } from './utils/ArtworkUrls'
import { GameLayoutConstants } from '../scene/props/shared/GameBoxUtils'
import { BatchEmitter } from './BatchEmitter'
import type {
    SteamNetworkFetchProgressEvent,
    SteamLibraryManifestReadyEvent,
} from '../types/InteractionEvents'
import type { SteamGame, SteamUser } from './SteamApiClient'

export class GamesLoader {
    private static readonly logger = Logger.createLogFunctions(GamesLoader.name)
    private logger = GamesLoader.logger
    
    private cache: CacheManager
    private batchClient: BatchAppDetailsClient

    constructor(
        cache: CacheManager,
        batchClient: BatchAppDetailsClient
    ) {
        this.cache = cache
        this.batchClient = batchClient
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
        const BATCH_SIZE = GameLayoutConstants.GAMES_PER_SURFACE * GameLayoutConstants.SURFACES_PER_SHELF

        if (steamUser.games.length > maxGames) {
            this.logger.warn(
                `Truncating ${steamUser.games.length} owned games down to maxGames=${maxGames} - ` +
                `AppSettings.maxGames defaults to 20 in dev mode. Not appropriate for a background ` +
                `completeness refresh that's meant to replace an already-rendered snapshot.`
            )
        }

        const sortedGames = this.sortAndLimitGames(steamUser.games, maxGames, sortFn)
        const appids = sortedGames.map(g => g.appid)

        const { renderableAppids, refreshAppids, renderableAppDetails, staleAppids } = await this.partitionByCache(appids)

        const renderableBatchCount = Math.ceil(renderableAppids.length / BATCH_SIZE)
        const refreshBatchCount = Math.ceil(refreshAppids.length / BATCH_SIZE)
        const totalBatchCount = renderableBatchCount + refreshBatchCount

        EventManager.getInstance().emit<SteamLibraryManifestReadyEvent>(SteamEventTypes.LibraryManifestReady, {
            totalGames: sortedGames.length,
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
            this.fetchAndEmitUncached(refreshAppids, gameByAppid, emitter)
        } else {
            await emitter.flush()
        }

        this.logger.info(
            `Loaded ${renderableGames.length} renderable games (${staleAppids.length} stale), ${refreshAppids.length} refreshing in background`
        )
        return renderableGames
    }

    /**
     * Read-only entity join against AppDetailsCache — no network fetch triggered, unlike
     * loadGamesProgressively. Used by channels that must render immediately without a Lambda
     * round-trip (imported libraries): an appid missing from the cache renders with its own
     * ownership-supplied fields (name/playtime) and no categories/genres rather than queueing
     * a background fetch, preserving the "zero-Lambda, works offline" property those channels
     * exist for.
     */
    public async enrichFromCache(games: SteamGame[]): Promise<SteamGame[]> {
        const appids = games.map(g => g.appid)
        const cachedAppDetails = await AppDetailsCache.getMany(appids)
        return games.map(game => {
            const cached = cachedAppDetails.get(game.appid)
            return this.buildEnhancedGame(game, cached ? this.normalizeBatchData(cached) : undefined)
        })
    }

    /**
     * Fetches appdetails for the given appids directly from the network and writes them into
     * AppDetailsCache - no BatchEmitter streaming (this is a one-off gap-fill, not the main
     * progressive-load path). Used by LocalSteamLibraryLoader to resolve appids
     * findMissingArtwork() flagged as still needing real artwork - which can already have a
     * local-only entry (name/tags/user_collections from LocalSteamDataWriter) that a blind
     * overwrite would destroy, so this merges rather than sets. Awaitable and cache-only, unlike
     * fetchAndEmitUncached (fire-and-forget, pushes into a BatchEmitter) - the two share
     * fetchAndNormalizeBatch for the actual network call and unlisted-shell handling.
     */
    public async fetchAndCacheAppDetails(appids: number[]): Promise<Map<number, AppDetailsData>> {
        if (appids.length === 0) {
            return new Map()
        }

        const { normalized } = await this.fetchAndNormalizeBatch(appids)
        if (normalized.size > 0) {
            await AppDetailsCache.mergeMany(normalized, Date.now())
        }
        return normalized
    }

    /**
     * Shared by fetchAndCacheAppDetails and fetchAndEmitUncached: fetches a batch and normalizes
     * each response into AppDetailsData, skipping unlisted shells. Returns both the raw responses
     * (fetchAndEmitUncached needs them to find every requested appid, including ones with no
     * normalized data) and the normalized map (what actually gets cached).
     */
    private async fetchAndNormalizeBatch(appids: number[]): Promise<{
        responses: Map<number, AppDetailsResponse>
        normalized: Map<number, AppDetailsData>
    }> {
        const responses = await this.batchClient.fetchBatch(appids, { batchSize: 100 })
        const normalized = new Map<number, AppDetailsData>()
        for (const [appid, response] of responses.entries()) {
            // An unlisted response is a deliberately minimal shell (see the Lambda's steam-api.js
            // comment) with no name - it exists so a later SteamSpy hydration pass can merge in a
            // real name, which doesn't happen on either caller of this method. Caching it as-is
            // would produce a renderable game with name: undefined, which crashes label rendering
            // downstream. Skip it; the appid stays absent and gets retried next load, same
            // "known, not solved" tradeoff as docs/tech-debt.md#id-metadata-refetch-no-circuit-breaker.
            if (response.success === false && response.unlisted) continue
            if (!response.data) continue
            normalized.set(appid, { ...this.normalizeBatchData(response.data), artwork_network_checked: true })
        }
        return { responses, normalized }
    }

    /**
     * Discovers every cached appid fit to show in the anonymous store and builds a full
     * SteamGame for each (see SteamIntegration.loadDemoGames). "Fit" means is_free === true
     * AND not undesirable_for_demo - the latter is set by scripts/bake-f2p-artwork.sh when an
     * appid's library_600x900.jpg 404'd against Steam's CDN at bake time, so the demo store never
     * shows a degraded/label box in what's meant to be the app's showcase. Both flags travel with
     * the same AppDetailsCache entry, so this filters more than just F2P despite the name.
     *
     * Unlike enrichFromCache, there's no known appid list to start from - this scans the whole
     * cache to find the demo-eligible set itself, then reuses the same buildEnhancedGame() field
     * mapping (artwork fallback chain, genres, categories, etc.) so the demo store gets
     * properly-formed games instead of a hand-rolled subset of fields.
     */
    public async getDemoGames(): Promise<SteamGame[]> {
        const allEntries = await AppDetailsCache.getAllEntries()
        const games: SteamGame[] = []

        for (const [appid, data] of allEntries) {
            if (data.is_free !== true || data.undesirable_for_demo === true) continue

            const baseGame: SteamGame = {
                appid,
                name: data.name,
                playtime_forever: 0,
                img_icon_url: '',
                img_logo_url: '',
                artwork: { icon: '', logo: '', header: '', library: '' }
            }
            games.push(this.buildEnhancedGame(baseGame, this.normalizeBatchData(data)))
        }

        return games
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
            await emitter.push(enhanced)
        }
        monitor.end({ count: cachedGames.length })
        return cachedGames
    }

    private fetchAndEmitUncached(
        uncachedAppids: number[],
        gameByAppid: Map<number, SteamGame>,
        emitter: BatchEmitter
    ): void {
        this.fetchAndNormalizeBatch(uncachedAppids)
            .then(async ({ responses, normalized }) => {
                // buildEnhancedGame() below already accepts undefined and renders correctly via
                // baseGame's own owned-game name, so an appid with no normalized data (unlisted
                // or otherwise missing) still renders - it just won't have appdetails cached.
                for (const appid of responses.keys()) {
                    const baseGame = gameByAppid.get(appid)
                    if (!baseGame) continue

                    const enhanced = this.buildEnhancedGame(baseGame, normalized.get(appid))
                    await emitter.push(enhanced)
                }

                await emitter.flush()

                if (normalized.size > 0) {
                    const cacheMonitor = PerformanceMonitor.start('cache-metadata', this.logger, ASYNC_CONTEXT)
                    await AppDetailsCache.setMany(normalized)
                    cacheMonitor.end({ count: normalized.size })
                }

                this.logger.info(`[ASYNC] Emitted ${normalized.size} uncached games in the background`)
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
        const cachedAppDetails = await AppDetailsCache.getMany(appids)
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
        const derivedArtwork = deriveArtworkFromAppId(game.appid)
        const headerUrl = appDetails?.artwork?.header
            || appDetails?.artwork?.capsule_v5
            || appDetails?.artwork?.capsule
            || derivedArtwork.header

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
                library: derivedArtwork.library
            },
            categories: appDetails?.categories,
            genres: appDetails?.genres,
            developers: appDetails?.developers,
            publishers: appDetails?.publishers,
            release_date: appDetails?.release_date,
            metacritic: appDetails?.metacritic,
            short_description: appDetails?.short_description,
            steamspy_tags: appDetails?.steamspy_tags,
            steamspy_top_tags: getTopSteamSpyTags(appDetails?.steamspy_tags),
            positive: appDetails?.positive,
            negative: appDetails?.negative,
            userscore: appDetails?.userscore,
            owners: appDetails?.owners,
            user_collections: appDetails?.user_collections
        }
    }
}
