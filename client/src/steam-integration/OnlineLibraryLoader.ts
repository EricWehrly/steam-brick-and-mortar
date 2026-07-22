/**
 * The online-fetch loading strategy: resolves a vanity URL/steamID to a steamID, fetches the
 * owned-games list, and progressively renders it. Extracted from SteamIntegration per
 * docs/tech-debt.md#id-steam-integration-loading-strategy-split - SteamIntegration remains the
 * substrate owner (gameLibrary mutation, storeSteamDataAndEmitEvent, emitGamesInBatches); this
 * module calls into that substrate via the injected callbacks rather than owning it.
 *
 * A plain function, not a class - nothing here holds state across calls. Matches
 * LocalSteamLibraryLoader's shape (the other three-plus-one "how does a library get loaded"
 * source in this codebase).
 */

import type { SteamApiClient } from '../steam'
import type { GameLibraryManager, GameLibraryState } from './GameLibraryManager'
import { EventManager } from '../core/EventManager'
import { StorePropsEventTypes } from '../scene/props/PropsEvents'
import type { StorePropsLibraryReloadRequestEvent } from '../scene/props/PropsEvents'
import { computeLibraryDiff } from './Library'
import type { LibraryGame } from './Library'
import { persistLibrary } from './LibraryStore'
import { ValidationUtils } from '../utils'
import { Logger } from '../utils/Logger'
import { AppSettings } from '../core/AppSettings'
import { sortByNumericField } from '../scene/categorization/GameSortFunctions'

const logger = Logger.createLogFunctions('OnlineLibraryLoader')

/** A real vanity name, never the internal "steamid:<id>" placeholder used when there's no vanity
 *  set - that placeholder should never surface as a display name. */
export function resolveDisplayName(vanityUrl: string | undefined): string | undefined {
    const trimmed = vanityUrl?.trim()
    return trimmed && !trimmed.toLowerCase().startsWith('steamid:') ? trimmed : undefined
}

export interface OnlineLibraryLoaderDeps {
    readonly steamClient: SteamApiClient
    readonly gameLibrary: GameLibraryManager
    /** SteamIntegration's storeSteamDataAndEmitEvent - the substrate call this strategy renders through. */
    readonly onLoaded: (userInput: string) => void
    /** SteamIntegration's loadDemoGames - only invoked when a load fails and nothing else is rendered. */
    readonly onFailureFallback: () => Promise<void>
    readonly isAnonymous: () => boolean
}

/**
 * Resolves and renders a library from Steam's online API.
 *
 * TD: caching-staleness-heuristic
 * 1. Determine if we should force an update based on staleness of cached data
 * 2. Or, if this is a manual "Refresh Cache Now" request from the UI panel (to be built)
 * 3. Determine the userInput (either passed from event, or use this.steamId if reloading)
 *
 * TD: background-refresh-and-update
 * After we load the cached data, we need a mechanism to fetch updated game data
 * in the background and gracefully inject any new games into the scene.
 */
export async function loadOnlineLibrary(userInput: string, forceUpdate: boolean = false, deps: OnlineLibraryLoaderDeps): Promise<void> {
    try {
        // Emits its own diff-based LibraryReloadRequest once the ownership list is fetched,
        // before this reassigns gameLibrary's user data.
        await loadGamesForUser(userInput, forceUpdate, deps)
        deps.onLoaded(userInput)

        // Snapshot for a fast render on the next reload (SteamIntegration.applyLibrary).
        const userData = deps.gameLibrary.getState().userData
        if (userData?.steamid) {
            persistLibrary({
                owner: {
                    steamId: userData.steamid,
                    displayName: resolveDisplayName(userData.vanity_url)
                },
                games: userData.games.map((g): LibraryGame => ({
                    appid: g.appid,
                    name: g.name,
                    playtimeForever: g.playtime_forever,
                    lastPlayed: g.rtime_last_played
                })),
                provenance: { channel: 'online', capturedAt: new Date().toISOString() }
            })
        }

        logger.info(forceUpdate ? 'Library load (forced update) completed' : 'Library load completed')
    } catch (error) {
        logger.error('Library load failed:', error)
        // Nothing loaded yet (a startup auto-load, not a user retrying over an existing
        // session) — fall back to the demo store so DataLoaded still fires and the Steam
        // UI panel becomes visible instead of staying hidden with no recovery path.
        if (deps.isAnonymous()) {
            await deps.onFailureFallback()
        }
    }
}

async function loadGamesForUser(userInput: string, ignoreCache: boolean, deps: OnlineLibraryLoaderDeps): Promise<GameLibraryState> {
    const parsedInput = ValidationUtils.parseSteamUserInput(userInput)

    logger.info(`Loading games for Steam user: ${parsedInput.value} (type: ${parsedInput.type}${ignoreCache ? ', ignoring cache' : ''})`);

    const { steamId, vanityUrl } = await getSteamIdAndVanityUrl(parsedInput, ignoreCache, deps)

    // A bare steamId input (e.g. the startup waterfall's online-fetch branch, which only
    // knows the steamId) resolves to the "steamid:<id>" placeholder here, not a real vanity
    // URL/display name. Preferring whatever's already rendered for this same steamId (a real
    // persona name from local-scan, a resolved vanity from an earlier online load) over that
    // placeholder keeps this from silently blanking a display name that was already known good.
    const currentUserData = deps.gameLibrary.getState().userData
    const preservedVanityUrl = currentUserData?.steamid === steamId ? currentUserData.vanity_url : undefined

    const userGames = await deps.steamClient.getUserGames(steamId, ignoreCache)
    userGames.steamid = steamId
    userGames.vanity_url = userGames.vanity_url ?? preservedVanityUrl ?? vanityUrl

    // Diffed against whatever's currently rendered, same as SteamIntegration.applyLibrary's
    // own reconcile step - so a same-or-similar library patches instead of forcing a blanket
    // teardown just because the incoming size wasn't known yet.
    const currentGames = currentUserData?.games
    if (currentGames?.length) {
        const diff = computeLibraryDiff(userGames.games, currentGames)
        EventManager.getInstance().emit<StorePropsLibraryReloadRequestEvent>(StorePropsEventTypes.LibraryReloadRequest, {
            incomingGameCount: userGames.games.length,
            removedGameNames: [...diff.removedGames.map(g => g.name), ...diff.renamedGames.map(g => g.oldName)]
        })
        logger.info('Emitted LibraryReloadRequest before library load')
    }

    deps.gameLibrary.setUserData(userGames)

    await deps.steamClient.loadGamesProgressively(userGames, {
        maxGames: AppSettings.get('maxGames'),
        sortFn: sortByNumericField('rtime_last_played', 'playtime_forever'),
    })

    logger.debug(`Progressive loading complete for ${userGames.game_count} games`)

    return deps.gameLibrary.getState()
}

async function getSteamIdAndVanityUrl(
    parsedInput: { type: "steamid" | "customurl"; value: string },
    ignoreCache: boolean,
    deps: OnlineLibraryLoaderDeps
): Promise<{ steamId: string; vanityUrl: string }> {
    let steamId: string
    let vanityUrl: string
    if (parsedInput.type === 'steamid') {
        // Direct steamID - no resolution needed
        steamId = parsedInput.value
        vanityUrl = `steamid:${steamId}` // Use a placeholder since we don't know the actual custom URL
    } else {
        // Custom URL - resolve to get steamID
        const resolveResponse = await deps.steamClient.resolveVanityUrl(parsedInput.value, ignoreCache)
        steamId = resolveResponse.steamid
        vanityUrl = resolveResponse.vanity_url
    }

    return { steamId, vanityUrl }
}
