import { Logger } from '../../utils/Logger'
import { EventManager } from '../../core/EventManager'
import {
    GameEventTypes,
    GameRenderEventTypes,
    StorePropsEventTypes,
    type ArtworkIntentSettledEvent,
    type BatchReadyForPlacementEvent,
} from '../../types/InteractionEvents'
import { GameArtworkProvider } from '../game-box/instancing/GameArtworkProvider'
import type { SteamGameData } from '../game-box/types/GameData'

interface IArtworkPrewarmer {
    prefetchArtwork(appid: number, url: string, name: string): Promise<PrefetchResult>
}

export type PrefetchResult = 'prefetched' | 'cached' | 'permanent-failure' | 'error'

interface ArtworkPrefetchCoordinatorOptions {
    renderer?: IArtworkPrewarmer | null
}

/**
 * Owns batch-time artwork prefetch state independently from shelf placement state.
 * A single artwork prefetch result can later satisfy one or more placement intents.
 */
export class ArtworkPrefetchCoordinator {
    private readonly logger = Logger.createLogFunctions(ArtworkPrefetchCoordinator.name)
    private readonly renderer: IArtworkPrewarmer | null
    private readonly artworkProvider: GameArtworkProvider
    private readonly boundHandleArtworkSettled: () => void
    private readonly boundHandleBatchReadyForPlacement: (event: CustomEvent<BatchReadyForPlacementEvent>) => void

    private readonly prefetchResults: Map<number, PrefetchResult> = new Map()
    private readonly appNamesByAppId: Map<number, string> = new Map()
    private hasLoggedExpectedFallbackSummary = false

    public constructor(options: ArtworkPrefetchCoordinatorOptions = {}) {
        this.renderer = options.renderer ?? null
        this.artworkProvider = GameArtworkProvider.getInstance()
        this.boundHandleArtworkSettled = this.logExpectedFallbackSummary.bind(this)
        this.boundHandleBatchReadyForPlacement = this.handleBatchReadyForPlacement.bind(this)

        EventManager.getInstance().registerEventHandler(
            GameEventTypes.ArtworkSettled,
            this.boundHandleArtworkSettled
        )
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.BatchReadyForPlacement,
            this.boundHandleBatchReadyForPlacement
        )
    }

    public reset(): void {
        this.prefetchResults.clear()
        this.appNamesByAppId.clear()
        this.hasLoggedExpectedFallbackSummary = false
    }

    public dispose(): void {
        EventManager.getInstance().deregisterEventHandler(
            GameEventTypes.ArtworkSettled,
            this.boundHandleArtworkSettled
        )
        EventManager.getInstance().deregisterEventHandler(
            StorePropsEventTypes.BatchReadyForPlacement,
            this.boundHandleBatchReadyForPlacement
        )
        this.reset()
    }

    public prefetchBatch(
        games: ReadonlyArray<SteamGameData>,
        renderer: IArtworkPrewarmer
    ): void {
        for (const game of games) {
            const appid = typeof game.appid === 'number' ? game.appid : 0
            this.appNamesByAppId.set(appid, game.name)
            const preferredUrl = appid > 0
                ? this.selectInitialLibraryUrl(appid, game.artwork)
                : undefined
            const secondaryUrl = this.selectSecondaryLibraryUrl(game.artwork, preferredUrl)

            if (!preferredUrl) {
                this.prefetchResults.set(appid, 'permanent-failure')
                this.emitArtworkIntentSettled(appid, game.name)
                continue
            }

            this.prefetchWithSecondaryUrl(renderer, appid, game.name, preferredUrl, secondaryUrl).then((result) => {
                this.prefetchResults.set(appid, result)
                this.emitArtworkIntentSettled(appid, game.name)
            }).catch((error) => {
                this.logger.warn(`prefetchArtwork failed for "${game.name}": ${error}`)
                this.prefetchResults.set(appid, 'error')
                this.emitArtworkIntentSettled(appid, game.name)
            })
        }
    }

    private async prefetchWithSecondaryUrl(
        renderer: IArtworkPrewarmer,
        appid: number,
        gameName: string,
        preferredUrl: string,
        secondaryUrl?: string
    ): Promise<PrefetchResult> {
        const firstResult = await renderer.prefetchArtwork(appid, preferredUrl, gameName)
        if (firstResult !== 'permanent-failure' || !secondaryUrl) {
            return firstResult
        }

        this.logger.debug(
            `Prefetch retry with secondary URL for "${gameName}" (appid ${appid}) after permanent-failure on preferred URL`
        )
        return renderer.prefetchArtwork(appid, secondaryUrl, gameName)
    }

    private handleBatchReadyForPlacement(event: CustomEvent<BatchReadyForPlacementEvent>): void {
        const { games, batchIndex, totalBatches } = event.detail

        this.logger.debug(
            `BatchReadyForPlacement: batch ${batchIndex + 1}/${totalBatches}, ${games.length} games — prewarming artwork`
        )

        if (!this.renderer) {
            this.logger.warn(
                'BatchReadyForPlacement received before GameDataReady initialized renderer — dropping batch prewarm to enforce event ordering'
            )
            return
        }

        this.prefetchBatch(games as SteamGameData[], this.renderer)
    }

    private selectInitialLibraryUrl(
        appId: number,
        artworkHints?: { library?: string; header?: string }
    ): string | undefined {
        const preferredUrl = artworkHints?.library ?? artworkHints?.header
        const strategy = this.artworkProvider.buildUrlStrategy(appId, 'library', preferredUrl)
        return strategy[0]?.url
    }

    private selectSecondaryLibraryUrl(
        artworkHints: { library?: string; header?: string } | undefined,
        preferredUrl: string | undefined
    ): string | undefined {
        if (!artworkHints?.header || !preferredUrl) {
            return undefined
        }
        return artworkHints.header === preferredUrl ? undefined : artworkHints.header
    }

    private emitArtworkIntentSettled(appid: number, gameName: string): void {
        EventManager.getInstance().emit<ArtworkIntentSettledEvent>(
            GameRenderEventTypes.ArtworkIntentSettled,
            { appid, gameName }
        )
    }

    public logExpectedFallbackSummary(): void {
        if (this.hasLoggedExpectedFallbackSummary) {
            return
        }

        const fallbackTitles: string[] = []
        for (const [appid, result] of this.prefetchResults) {
            if (result !== 'permanent-failure' && result !== 'error') {
                continue
            }
            const title = this.appNamesByAppId.get(appid)
            if (title) {
                fallbackTitles.push(title)
            }
        }

        if (fallbackTitles.length > 0) {
            fallbackTitles.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
            const previewLimit = 25
            const preview = fallbackTitles.slice(0, previewLimit)
            const remaining = fallbackTitles.length - preview.length
            const overflowSuffix = remaining > 0 ? ` (+${remaining} more)` : ''

            this.logger.info(
                `Artwork fallback summary: ${fallbackTitles.length} game(s) will use labels this run: ` +
                `${preview.join(', ')}${overflowSuffix}`
            )
        }

        this.hasLoggedExpectedFallbackSummary = true
    }

}