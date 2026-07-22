/**
 * The anonymous demo-store loading strategy. Extracted from SteamIntegration per
 * docs/tech-debt.md#id-steam-integration-loading-strategy-split - SteamIntegration remains the
 * substrate owner (gameLibrary mutation, storeSteamDataAndEmitEvent, emitGamesInBatches); this
 * module calls into that substrate via the injected callbacks rather than owning it.
 *
 * A plain function, not a class - nothing here holds state across calls, and this strategy is
 * explicitly meant to be temporary (the demo store exists to be replaced by a real library, not
 * to persist as a long-lived peer of the other loading strategies), so it gets the least
 * structural investment of the three.
 */

import type { SteamApiClient, SteamGame, SteamUser } from '../steam'
import type { GameLibraryManager } from './GameLibraryManager'
import { Logger } from '../utils/Logger'

const logger = Logger.createLogFunctions('DemoLibraryLoader')

export interface DemoLibraryLoaderDeps {
    readonly steamClient: SteamApiClient
    readonly gameLibrary: GameLibraryManager
    /** SteamIntegration's storeSteamDataAndEmitEvent(null) - the substrate call this strategy renders through. */
    readonly onLoaded: () => void
    /** SteamIntegration's emitGamesInBatches. */
    readonly emitGamesInBatches: (games: SteamGame[]) => Promise<void>
}

/**
 * Load the anonymous store from whatever the release's baked appdetails cache actually
 * contains (is_free === true, undesirable_for_demo unset - see
 * GamesLoader.getDemoGames()) - no hand-maintained game list, no network calls, no
 * separate runtime check for artwork quality. Awaits the baked-cache seed so a cold cache
 * still gets the full set. See docs/plans/f2p-artwork-bake-plan.md.
 */
export async function loadDemoLibrary(deps: DemoLibraryLoaderDeps): Promise<void> {
    try {
        const games = await deps.steamClient.getDemoGames()

        const demoUser: SteamUser = {
            steamid: '',
            vanity_url: '',
            game_count: games.length,
            retrieved_at: new Date().toISOString(),
            games
        }

        // Register games in gameLibrary so they're available for storeSteamDataAndEmitEvent().
        // vanity_url/steamid are empty strings (not undefined) so the UI can access them
        // without crashes, but isAnonymous() returns true because steam.userInput is not set.
        deps.gameLibrary.setUserData(demoUser)

        deps.onLoaded()
        await deps.emitGamesInBatches(games)

        logger.info(`Demo store loaded: ${games.length} games`)
    } catch (error) {
        logger.error('Failed to load demo games:', error)
    }
}
