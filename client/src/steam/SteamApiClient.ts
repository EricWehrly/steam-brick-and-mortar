import { HttpClient } from './http/HttpClient'
import { CacheManager } from './cache/SimpleCacheManager'
import { RateLimiter } from './rate-limit/RateLimiter'
import { BatchAppDetailsClient } from './batch/BatchAppDetailsClient'
import { Logger } from '../utils/Logger'
import { AppDetailsCache } from './cache/AppDetailsCache'
import { BakedCacheLoader } from './cache/BakedCacheLoader'
import type { SteamGameMetadata } from './types/SteamMetadata'
import { GamesLoader } from './GamesLoader'
import { ArtworkPackSeeder } from '../scene/game-box/instancing/ArtworkPackSeeder'
import { EventManager } from '../core/EventManager'
import { SteamEventTypes } from '../types/InteractionEvents'
import type { SteamCacheClearEvent } from '../types/InteractionEvents'
import { DataManager } from '../core/data/DataManager'
import { DataDomain, DataKey } from '../core/data/DataTypes'

export interface SteamGame extends SteamGameMetadata {
    appid: number
    name: string
    playtime_forever: number
    playtime_2weeks?: number
    /** Unix timestamp of last play session. 0 means never played (but owned). */
    rtime_last_played?: number
    img_icon_url: string
    img_logo_url: string
    artwork: {
        icon: string
        logo: string
        header: string
        library: string
    }
    playtime_disconnected?: number
}

export interface SteamUser {
    steamid: string
    vanity_url?: string
    game_count: number
    games: SteamGame[]
    retrieved_at: string
}

export interface SteamResolveResponse {
    vanity_url: string
    steamid: string
    resolved_at: string
}

export interface SteamApiError {
    error: string
    message: string
    timestamp: string
}

const CACHED_USER_TTL = 48 * 60 * 60 * 1000 // 48 hours in milliseconds

/**
 * Steam API client. Public surface kept intentionally small — heavy lifting
 * (progressive game loading, batch fetching, caching) lives in GamesLoader.
 */
export class SteamApiClient {
    private static instance: SteamApiClient | null = null
    private static readonly logger = Logger.createLogFunctions(SteamApiClient.name)
    private http: HttpClient
    private cache: CacheManager
    private rateLimiter: RateLimiter
    private batchClient: BatchAppDetailsClient
    private appDetailsCache: AppDetailsCache
    private bakedCacheLoader: BakedCacheLoader
    /** Public so callers with no other reason to depend on SteamApiClient (e.g.
     *  LocalSteamLibraryLoader's network gap-fill) can call GamesLoader directly instead of
     *  going through a same-signature pass-through method on this class. */
    public readonly gamesLoader: GamesLoader
    // TODO: revisit whether getDemoGames() still needs to await this, or whether the demo list
    // can be built downstream of app-details-cache readiness instead of blocking on it up front.
    private readonly appDetailsCacheReady: Promise<void>
    // TODO: revisit whether getDemoGames() still needs to await this, or whether the demo store
    // can rely on RenderIntentCoordinator's existing settle-on-artwork gating instead of blocking
    // on the pack seed up front. Deliberately left as an upfront await for now (see docblock below).
    private readonly artworkPackReady: Promise<void>

    private constructor() {
        const apiBaseUrl = import.meta.env.VITE_STEAM_API_BASE_URL
        this.http = new HttpClient({ baseUrl: apiBaseUrl })
        // Make the global cache duration infinite so items stay forever unless given a specific TTL
        this.cache = new CacheManager({ cachePrefix: 'steam_api_', cacheDuration: Infinity })
        this.rateLimiter = new RateLimiter({ requestsPerSecond: 4 })
        this.batchClient = new BatchAppDetailsClient(apiBaseUrl)
        this.appDetailsCache = new AppDetailsCache()
        this.bakedCacheLoader = new BakedCacheLoader(this.appDetailsCache)

        // Initialize app details cache, then seed it from the baked release bundles.
        // Fire-and-forget for scene startup in general (never blocks); callers that need the
        // seeded cache (e.g. the anonymous store's demo game list) await appDetailsCacheReady.
        this.appDetailsCacheReady = this.appDetailsCache.init()
            .then(() => this.bakedCacheLoader.seedIfNeeded())
            .catch(error => {
                console.warn('⚠️ [SteamApiClient] Failed to initialize app details cache:', error)
            })
            .then(() => {
                DataManager.getInstance().set(DataKey.AppDetailsCacheSeeded, true, { domain: DataDomain.Cache })
                EventManager.getInstance().emit(SteamEventTypes.AppDetailsCacheSeeded)
            })

        // Same fire-and-forget-but-awaitable shape as appDetailsCacheReady, for the baked F2P
        // artwork pack. getDemoGames() awaits both so first paint never races the seed.
        this.artworkPackReady = new ArtworkPackSeeder().seedIfNeeded()
            .catch(error => {
                console.warn('⚠️ [SteamApiClient] Failed to seed artwork pack:', error)
            })

        const eventManager = EventManager.getInstance();
        eventManager.registerEventHandler<SteamCacheClearEvent>(SteamEventTypes.CacheClear, this.handleCacheClear.bind(this))

        this.gamesLoader = new GamesLoader(
            this.appDetailsCache,
            this.cache,
            this.batchClient
        )
    }

    public static getInstance(): SteamApiClient {
        if (!SteamApiClient.instance) {
            SteamApiClient.instance = new SteamApiClient()
        }
        return SteamApiClient.instance
    }

    /** For testing - resets the singleton so the next getInstance() call constructs fresh. */
    public static dispose(): void {
        SteamApiClient.instance = null
    }

    public async resolveVanityUrl(vanityUrl: string, ignoreCache = false): Promise<SteamResolveResponse> {
        if (!vanityUrl || vanityUrl.trim().length === 0) {
            throw new Error('Vanity URL cannot be empty')
        }

        const cleanVanityUrl = vanityUrl.trim().toLowerCase()
        const cacheKey = `resolve_${cleanVanityUrl}`

        if (!ignoreCache) {
            const cached = this.cache.get<SteamResolveResponse>(cacheKey)
            if (cached) return cached
        }

        const endpoint = `/resolve/${encodeURIComponent(cleanVanityUrl)}`
        SteamApiClient.logger.debug(`Resolving vanity URL: "${vanityUrl}" -> "${cleanVanityUrl}"`)
        
        const rawResponse = await this.http.makeRequest<unknown>(endpoint)
        const response = this.normalizeResolveResponse(rawResponse, cleanVanityUrl)
        SteamApiClient.logger.info(`Vanity URL resolved: ${response.vanity_url || cleanVanityUrl}`)
        
        this.cache.set(cacheKey, response)
        return response
    }

    private normalizeResolveResponse(response: unknown, requestedVanityUrl: string): SteamResolveResponse {
        const isObject = (value: unknown): value is Record<string, unknown> =>
            typeof value === 'object' && value !== null

        if (!isObject(response)) {
            throw new Error('Invalid resolve vanity URL response shape')
        }

        if (response.success === false) {
            const message = typeof response.message === 'string' ? response.message : 'Failed to resolve vanity URL'
            throw new Error(message)
        }

        const payload = response.success === true && isObject(response.data) ? response.data : response
        const steamid = typeof payload.steamid === 'string' ? payload.steamid : undefined
        if (!steamid) {
            throw new Error('Invalid resolve vanity URL response shape')
        }

        return {
            steamid,
            vanity_url: typeof payload.vanity_url === 'string' ? payload.vanity_url : requestedVanityUrl,
            resolved_at: typeof payload.resolved_at === 'string' ? payload.resolved_at : new Date().toISOString()
        }
    }

    public async getUserGames(steamId: string, ignoreCache = false): Promise<SteamUser> {
        if (!steamId || steamId.trim().length === 0) {
            throw new Error('Steam ID cannot be empty')
        }

        const cacheKey = `games_${steamId}`

        if (!ignoreCache) {
            const cached = this.cache.get<SteamUser>(cacheKey)
            if (cached) return cached

            // Cache expired but we have stale data. Use it, but trigger background refresh.
            const stale = this.cache.getStale<SteamUser>(cacheKey)
            if (stale) {
                SteamApiClient.logger.info(`Cache for ${steamId} is stale (older than ${CACHED_USER_TTL / (60 * 60 * 1000)}h). Returning stale data while fetching update...`)
                // Fire and forget
                this.fetchAndCacheUserGames(steamId, cacheKey).catch(err => {
                    SteamApiClient.logger.error(`Background refresh for ${steamId} failed:`, err)
                })
                return stale
            }
        }
        
        return this.fetchAndCacheUserGames(steamId, cacheKey)
    }

    private async fetchAndCacheUserGames(steamId: string, cacheKey: string): Promise<SteamUser> {
        const endpoint = `/games/${encodeURIComponent(steamId)}`
        SteamApiClient.logger.debug(`Fetching games for Steam ID: ${steamId}`)

        try {
            const response = await this.http.makeRequest<SteamUser>(endpoint)

            SteamApiClient.logger.info(`Fetched ${response.game_count} games for ${response.vanity_url || steamId}`)

            if (response.game_count === 0) {
                SteamApiClient.logger.warn('User has 0 games — may indicate privacy settings or an empty library')
            }

            // 48 hour TTL for game lists
            this.cache.set(cacheKey, response, { ttlMs: CACHED_USER_TTL })
            return response
        } catch (error) {
            SteamApiClient.logger.error('Failed to fetch user games:', error)
            throw error
        }
    }

    public async loadGamesProgressively(
        steamUser: SteamUser,
        options: {
            maxGames?: number
            sortFn?: (a: SteamGame, b: SteamGame) => number
        } = {}
    ): Promise<SteamGame[]> {
        return this.gamesLoader.loadGamesProgressively(steamUser, options)
    }

    public async enrichFromCache(games: SteamGame[]): Promise<SteamGame[]> {
        return this.gamesLoader.enrichFromCache(games)
    }

    /**
     * Routes CacheClear to the right internal method for its scope - see CacheClearScope.
     * Switches on the exact scope value (not an else-default) so an unhandled future scope
     * no-ops here instead of silently running the wrong branch's clear; the `never` in
     * `default` makes the compiler error if CacheClearScope grows a value this doesn't handle.
     */
    private async handleCacheClear(event: CustomEvent<SteamCacheClearEvent>): Promise<void> {
        switch (event.detail.scope) {
            case 'all':
                await this.clearCache()
                break
            case 'identity':
                this.clearCurrentUser()
                break
            default:
                event.detail.scope satisfies never
        }
    }

    /**
     * Clears Steam-derived data caches only (identity, games, entity metadata) - never the
     * pixel/texture cache. That's intentional, not an oversight: PixelDataCache holds decoded
     * image data sourced directly from Steam's CDN, a different origin and lifecycle from the
     * app data here. Callers that want "clear everything" fire a separate ImageCacheClear
     * event alongside this one rather than this method reaching into PixelDataCache itself -
     * see cache-clear-domain-unification-plan.md.
     */
    public async clearCache(): Promise<void> {
        this.cache.clear()
        await this.appDetailsCache.clear()
    }

    /**
     * Clears the cached user identity (vanity URL -> steamid resolution) only.
     * Leaves the per-profile games cache and the artwork cache untouched - those are
     * separate cache domains, refilled downstream once a new user is resolved.
     */
    public clearCurrentUser(): void {
        this.cache.deleteByPrefix('resolve_')
    }

    /**
     * The anonymous store's game list, from the app details cache - see
     * GamesLoader.getDemoGames() for the actual is_free/undesirable_for_demo filtering and
     * enrichment (the "heavy lifting" this class's own docblock defers elsewhere).
     *
     * Awaits both the baked-cache seed and the artwork pack seed first, so this reflects the
     * full baked set - and its artwork is already in PixelDataCache - even on a cold cache. The
     * readiness wait belongs here since SteamApiClient owns that lifecycle. This means first-load
     * demo store render is gated on the whole appdetails bundle *and* the artwork pack finishing
     * (fetch + decode + IndexedDB write for both), not just the games actually shown. Assumed
     * inconsequential (a few thousand small JSON entries plus one ~2.6MB image, decoded once,
     * off the main thread) but not measured - worth a look if startup timing ever becomes a
     * concern. See docs/plans/f2p-artwork-bake-plan.md.
     */
    public async getDemoGames(): Promise<SteamGame[]> {
        await Promise.all([this.appDetailsCacheReady, this.artworkPackReady])
        return this.gamesLoader.getDemoGames()
    }

    public getCacheManager(): CacheManager { return this.cache }

    public hasCached(key: string): boolean { return this.cache.get(key) !== null }

    public getCached<T>(key: string): T | null { return this.cache.get<T>(key) }

    public getCachedUsers(): Array<{ vanityUrl: string, displayName: string, gameCount: number, steamId: string }> {
        const cachedUsers: Array<{ vanityUrl: string, displayName: string, gameCount: number, steamId: string }> = []
        const userMap = new Map<string, { vanityUrl?: string, resolveData?: SteamResolveResponse, gamesData?: SteamUser }>()
        
        // Single pass through all cache keys to collect user data
        const allKeys = this.cache.getAllKeys()
        
        for (const key of allKeys) {
            if (key.startsWith('resolve_')) {
                const vanityUrl = key.replace('resolve_', '')
                const resolveData = this.cache.get<SteamResolveResponse>(key)
                if (resolveData && resolveData.steamid) {
                    const existing = userMap.get(resolveData.steamid) || {}
                    existing.vanityUrl = vanityUrl
                    existing.resolveData = resolveData
                    userMap.set(resolveData.steamid, existing)
                }
            } else if (key.startsWith('games_')) {
                const steamId = key.replace('games_', '')
                const gamesData = this.cache.get<SteamUser>(key)
                if (gamesData) {
                    const existing = userMap.get(steamId) || {}
                    existing.gamesData = gamesData
                    userMap.set(steamId, existing)
                }
            }
        }
        
        // Build final user list from users who have both resolve and games data
        for (const [steamId, userData] of userMap.entries()) {
            if (userData.resolveData && userData.gamesData) {
                cachedUsers.push({
                    vanityUrl: userData.vanityUrl || userData.gamesData.vanity_url || steamId,
                    displayName: userData.gamesData.vanity_url || userData.vanityUrl || steamId,
                    gameCount: userData.gamesData.game_count || 0,
                    steamId: steamId
                })
            }
        }
        
        return cachedUsers.sort((a, b) => a.displayName.localeCompare(b.displayName))
    }
}
