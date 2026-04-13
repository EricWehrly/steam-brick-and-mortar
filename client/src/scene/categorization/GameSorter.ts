/**
 * GameSorter
 *
 * Coordinator: listens for AllBatchesComplete, reads the full game list,
 * applies the active sort policy, and emits GameEventTypes.GamesSort.
 *
 * Sort primitives live in GameSortFunctions — import from there for custom
 * sort or grouping work. Bucket classification (recently-played time windows)
 * lives here because it is specific to the recency sort policy.
 */

import { EventManager } from '../../core/EventManager'
import { DataManager } from '../../core/data/DataManager'
import { Logger } from '../../utils/Logger'
import { GameEventTypes } from '../../types/InteractionEvents'
import type { AllBatchesCompleteEvent, GamesSortEvent } from '../../types/EnvironmentEvents'
import type { SteamGameData } from '../game-box/types/GameData'
import { sortByNumericField, primaryGenre, KNOWN_GENRES } from './GameSortFunctions'

// Re-export so callers don't need two imports for sort + bucket types
export { sortByNumericField, sortAlphabetically, sortByEnumIndex, chainComparators, groupByKey, groupByGenre, KNOWN_GENRES, sortByGenreThenPlaytime, resolveGenre, primaryGenre } from './GameSortFunctions'
export type { ShelfGroup } from './GameSortFunctions'

// ─── Recently-played bucket types ─────────────────────────────────────────────

export enum RecentlyPlayedBucket {
    Today     = 'today',
    ThisWeek  = 'this-week',
    ThisMonth = 'this-month',
    ThisYear  = 'this-year',
    Before    = 'before',
    Unplayed  = 'unplayed',
}

const BUCKET_LABELS: Record<RecentlyPlayedBucket, string> = {
    [RecentlyPlayedBucket.Today]:     'Played Today',
    [RecentlyPlayedBucket.ThisWeek]:  'Played This Week',
    [RecentlyPlayedBucket.ThisMonth]: 'Played This Month',
    [RecentlyPlayedBucket.ThisYear]:  'Played This Year',
    [RecentlyPlayedBucket.Before]:    'Played Before',
    [RecentlyPlayedBucket.Unplayed]:  'Never Played',
}

export function getBucketLabel(bucket: RecentlyPlayedBucket): string {
    return BUCKET_LABELS[bucket]
}

export function getRecentlyPlayedBucket(game: SteamGameData, nowSeconds?: number): RecentlyPlayedBucket {
    const now = nowSeconds ?? Math.floor(Date.now() / 1000)
    const lastPlayed = game.rtime_last_played ?? 0
    if (lastPlayed === 0) return RecentlyPlayedBucket.Unplayed
    const diff = now - lastPlayed
    if (diff < 0) return RecentlyPlayedBucket.Today
    const DAY = 86_400
    if (diff < DAY)       return RecentlyPlayedBucket.Today
    if (diff < 7 * DAY)   return RecentlyPlayedBucket.ThisWeek
    if (diff < 30 * DAY)  return RecentlyPlayedBucket.ThisMonth
    if (diff < 365 * DAY) return RecentlyPlayedBucket.ThisYear
    return RecentlyPlayedBucket.Before
}

// ─── GameSorter ────────────────────────────────────────────────────────────────

export class GameSorter {
    private static readonly logger = Logger.createLogFunctions(GameSorter.name)

    constructor() {
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.AllBatchesComplete,
            (_event: CustomEvent<AllBatchesCompleteEvent>) => this.sortByRecentlyPlayed()
        )
        GameSorter.logger.debug('GameSorter initialized — subscribed to AllBatchesComplete')
    }

    public sortByGenre(): void {
        const games = DataManager.getInstance().get<SteamGameData[]>('steam.games') ?? []

        if (games.length === 0) {
            GameSorter.logger.warn('sortByGenre called but no games in DataManager — skipping emit')
            return
        }

        const sortedGames: ReadonlyArray<Readonly<SteamGameData>> =
            [...games].sort((firstGame, secondGame) => {
                const firstGenreIndex = KNOWN_GENRES.indexOf(primaryGenre(firstGame as SteamGameData))
                const secondGenreIndex = KNOWN_GENRES.indexOf(primaryGenre(secondGame as SteamGameData))
                const normalizedFirstIndex = firstGenreIndex === -1 ? Infinity : firstGenreIndex
                const normalizedSecondIndex = secondGenreIndex === -1 ? Infinity : secondGenreIndex
                if (normalizedFirstIndex !== normalizedSecondIndex) {
                    return normalizedFirstIndex - normalizedSecondIndex
                }
                return (secondGame.playtime_forever ?? 0) - (firstGame.playtime_forever ?? 0)
            })

        EventManager.getInstance().emit<GamesSortEvent>(GameEventTypes.GamesSort, {
            sortedGames,
            buckets: this.buildGenreBucketMap(sortedGames),
        })
        GameSorter.logger.debug(`GamesSort emitted (by genre): ${sortedGames.length} games`)
    }

    public sortByPlaytime(): void {
        const games = DataManager.getInstance().get<SteamGameData[]>('steam.games') ?? []

        if (games.length === 0) {
            GameSorter.logger.warn('sortByPlaytime called but no games in DataManager — skipping emit')
            return
        }

        const sortedGames: ReadonlyArray<Readonly<SteamGameData>> =
            [...games].sort(sortByNumericField<SteamGameData>('playtime_forever'))

        EventManager.getInstance().emit<GamesSortEvent>(GameEventTypes.GamesSort, {
            sortedGames,
            buckets: new Map<string, string>(),
        })

        GameSorter.logger.debug(`GamesSort emitted (by playtime): ${sortedGames.length} games`)
    }

    public sortByRecentlyPlayed(): void {
        const games = DataManager.getInstance().get<SteamGameData[]>('steam.games') ?? []

        if (games.length === 0) {
            GameSorter.logger.warn('AllBatchesComplete fired but no games in DataManager — skipping emit')
            return
        }

        // Always include all games. rtime_last_played === 0 means "never played" —
        // those go to RecentlyPlayedBucket.Unplayed, not dropped.
        const sortedGames: ReadonlyArray<Readonly<SteamGameData>> =
            [...games].sort(sortByNumericField<SteamGameData>('rtime_last_played', 'playtime_forever'))

        const buckets = this.buildBucketMap(sortedGames)

        EventManager.getInstance().emit<GamesSortEvent>(GameEventTypes.GamesSort, {
            sortedGames,
            buckets,
        })

        GameSorter.logger.debug(
            `GamesSort emitted: ${sortedGames.length} games, ${buckets.size} buckets`
        )
    }

    private buildBucketMap(
        sortedGames: ReadonlyArray<Readonly<SteamGameData>>
    ): ReadonlyMap<string, string> {
        const buckets = new Map<string, string>()
        for (const game of sortedGames) {
            const bucket = getRecentlyPlayedBucket(game as SteamGameData)
            if (!buckets.has(bucket)) {
                buckets.set(bucket, getBucketLabel(bucket))
            }
        }
        return buckets
    }

    private buildGenreBucketMap(
        sortedGames: ReadonlyArray<Readonly<SteamGameData>>
    ): ReadonlyMap<string, string> {
        const buckets = new Map<string, string>()
        for (const game of sortedGames) {
            const genre = primaryGenre(game as SteamGameData)
            if (!buckets.has(genre)) {
                buckets.set(genre, genre)
            }
        }
        return buckets
    }
}
