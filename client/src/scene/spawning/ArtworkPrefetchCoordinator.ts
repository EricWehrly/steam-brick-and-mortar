import { Logger } from '../../utils/Logger'
import { EventManager } from '../../core/EventManager'
import {
    GameEventTypes,
    GameRenderEventTypes,
    StorePropsEventTypes,
    type ArtworkIntentSettledEvent,
    type BatchReadyForPlacementEvent,
} from '../../types/InteractionEvents'
import { GpuGameBoxRenderer } from '../game-box/GpuGameBoxRenderer'
import type { SteamGameData } from '../game-box/types/GameData'

export type PrefetchResult = 'prefetched' | 'cached' | 'permanent-failure' | 'error'

interface ArtworkPrefetchCoordinatorOptions {
    getRenderer?: () => GpuGameBoxRenderer | null
}

/**
 * Owns batch-time artwork prefetch state independently from shelf placement state.
 * A single artwork prefetch result can later satisfy one or more placement intents.
 */
export class ArtworkPrefetchCoordinator {
    private readonly logger = Logger.createLogFunctions(ArtworkPrefetchCoordinator.name)
    private readonly getRenderer: () => GpuGameBoxRenderer | null
    private readonly boundHandleArtworkSettled: () => void
    private readonly boundHandleBatchReadyForPlacement: (event: CustomEvent<BatchReadyForPlacementEvent>) => void

    private readonly prefetchResults: Map<number, PrefetchResult> = new Map()
    private readonly appNamesByAppId: Map<number, string> = new Map()
    private hasLoggedExpectedFallbackSummary = false

    public constructor(options: ArtworkPrefetchCoordinatorOptions = {}) {
        this.getRenderer = options.getRenderer ?? (() => null)
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

    public prefetchBatch(
        games: ReadonlyArray<SteamGameData>,
        renderer: GpuGameBoxRenderer
    ): void {
        for (const game of games) {
            const appid = typeof game.appid === 'number' ? game.appid : 0
            this.appNamesByAppId.set(appid, game.name)
            const artworkUrl = this.selectBestArtworkUrl(game)

            if (!artworkUrl) {
                this.prefetchResults.set(appid, 'permanent-failure')
                this.emitArtworkIntentSettled(appid, game.name, 'permanent-failure')
                continue
            }

            renderer.prefetchArtwork(appid, artworkUrl, game.name).then((result) => {
                this.prefetchResults.set(appid, result)
                this.emitArtworkIntentSettled(appid, game.name, result)
            }).catch((error) => {
                this.logger.warn(`prefetchArtwork failed for "${game.name}": ${error}`)
                this.prefetchResults.set(appid, 'error')
                this.emitArtworkIntentSettled(appid, game.name, 'error')
            })
        }
    }

    private handleBatchReadyForPlacement(event: CustomEvent<BatchReadyForPlacementEvent>): void {
        const { games, batchIndex, totalBatches } = event.detail

        this.logger.debug(
            `BatchReadyForPlacement: batch ${batchIndex + 1}/${totalBatches}, ${games.length} games — prewarming artwork`
        )

        const renderer = this.getRenderer()
        if (!renderer) {
            this.logger.warn(
                'BatchReadyForPlacement received before GameDataReady initialized renderer — dropping batch prewarm to enforce event ordering'
            )
            return
        }

        this.prefetchBatch(games as SteamGameData[], renderer)
    }

    private emitArtworkIntentSettled(
        appid: number,
        gameName: string,
        result: ArtworkIntentSettledEvent['result']
    ): void {
        EventManager.getInstance().emit<ArtworkIntentSettledEvent>(
            GameRenderEventTypes.ArtworkIntentSettled,
            { appid, gameName, result }
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

    private selectBestArtworkUrl(game: SteamGameData): string | undefined {
        if (game.artwork?.library) return game.artwork.library
        if (game.artwork?.header) return game.artwork.header
        if (game.appid) {
            return `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/library_600x900.jpg`
        }
        return undefined
    }
}