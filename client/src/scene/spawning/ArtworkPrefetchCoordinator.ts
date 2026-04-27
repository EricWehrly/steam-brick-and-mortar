import { Logger } from '../../utils/Logger'
import { GpuGameBoxRenderer } from '../game-box/GpuGameBoxRenderer'
import type { SteamGameData } from '../game-box/types/GameData'

export type PrefetchResult = 'prefetched' | 'cached' | 'permanent-failure' | 'error'

/**
 * Owns batch-time artwork prefetch state independently from shelf placement state.
 * A single artwork prefetch result can later satisfy one or more placement intents.
 */
export class ArtworkPrefetchCoordinator {
    private readonly logger = Logger.createLogFunctions(ArtworkPrefetchCoordinator.name)

    private readonly prefetchResults: Map<number, PrefetchResult> = new Map()
    private readonly appNamesByAppId: Map<number, string> = new Map()
    private hasLoggedExpectedFallbackSummary = false

    public reset(): void {
        this.prefetchResults.clear()
        this.appNamesByAppId.clear()
        this.hasLoggedExpectedFallbackSummary = false
    }

    public getResult(appid: number): PrefetchResult | undefined {
        return this.prefetchResults.get(appid)
    }

    public prefetchBatch(
        games: ReadonlyArray<SteamGameData>,
        renderer: GpuGameBoxRenderer,
        onSettled: (appid: number) => void
    ): void {
        for (const game of games) {
            const appid = typeof game.appid === 'number' ? game.appid : 0
            this.appNamesByAppId.set(appid, game.name)
            const artworkUrl = this.selectBestArtworkUrl(game)

            if (!artworkUrl) {
                this.prefetchResults.set(appid, 'permanent-failure')
                onSettled(appid)
                continue
            }

            renderer.prefetchArtwork(appid, artworkUrl, game.name).then((result) => {
                this.prefetchResults.set(appid, result)
                onSettled(appid)
            }).catch((error) => {
                this.logger.warn(`prefetchArtwork failed for "${game.name}": ${error}`)
                this.prefetchResults.set(appid, 'error')
                onSettled(appid)
            })
        }
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