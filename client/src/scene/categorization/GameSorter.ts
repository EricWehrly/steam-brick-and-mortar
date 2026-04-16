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
import { GameEventTypes, UIEventTypes } from '../../types/InteractionEvents'
import { GameSortModes } from '../../types/EnvironmentEvents'
import type { AllBatchesCompleteEvent, GamesSortEvent, SortRequestedEvent } from '../../types/EnvironmentEvents'
import type { SteamGameData } from '../game-box/types/GameData'
import { sortByNumericField, primaryGenre, KNOWN_GENRES, sortByGenreThenPlaytime } from './GameSortFunctions'
import type { GameSortMode } from '../../types/EnvironmentEvents'
import { SteamIntegration } from '../../steam-integration/SteamIntegration'

// Re-export so callers don't need two imports for sort + bucket types
export { sortByNumericField, sortAlphabetically, sortByEnumIndex, chainComparators, groupByKey, groupByGenre, KNOWN_GENRES, sortByGenreThenPlaytime, resolveGenre, primaryGenre } from './GameSortFunctions'
export type { ShelfGroup } from './GameSortFunctions'

// ─── Playtime bucket types ───────────────────────────────────────────────────

export enum PlaytimeBucket {
    Heavy    = 'heavy',
    Moderate = 'moderate',
    Light    = 'light',
    Minimal  = 'minimal',
    Unplayed = 'unplayed',
}

const PLAYTIME_BUCKET_LABELS: Record<PlaytimeBucket, string> = {
    [PlaytimeBucket.Heavy]:    'Played 100+ Hours',
    [PlaytimeBucket.Moderate]: 'Played 10–100 Hours',
    [PlaytimeBucket.Light]:    'Played 1–10 Hours',
    [PlaytimeBucket.Minimal]:  'Played Under an Hour',
    [PlaytimeBucket.Unplayed]: 'Never Played',
}

export function getPlaytimeBucketLabel(bucket: PlaytimeBucket): string {
    return PLAYTIME_BUCKET_LABELS[bucket]
}

export function getPlaytimeBucket(game: SteamGameData): PlaytimeBucket {
    const minutes = game.playtime_forever ?? 0
    if (minutes === 0)     return PlaytimeBucket.Unplayed
    if (minutes <   60)   return PlaytimeBucket.Minimal
    if (minutes <   600)  return PlaytimeBucket.Light
    if (minutes <  6_000) return PlaytimeBucket.Moderate
    return PlaytimeBucket.Heavy
}

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
            (_event: CustomEvent<AllBatchesCompleteEvent>) => this.sortInitial()
        )
        EventManager.getInstance().registerEventHandler(
            UIEventTypes.SortRequested,
            (event: CustomEvent<SortRequestedEvent>) => this.handleSortRequested(event.detail)
        )
        GameSorter.logger.debug('GameSorter initialized — subscribed to AllBatchesComplete + SortRequested')
    }

    // TD: steamspy-initial-sort — replace ByGenre anonymous fallback with a popularity sort
    // once SteamSpy data (player counts / review scores) is available in the batch pipeline.
    private sortInitial(): void {
        if (SteamIntegration.getInstance().isAnonymous()) {
            this.sortByGenre()
        } else {
            this.sortByRecentlyPlayed()
        }
    }

    private handleSortRequested(detail: SortRequestedEvent): void {
        switch (detail.sortMode) {
            case GameSortModes.RecentlyPlayed: this.sortByRecentlyPlayed(); break
            case GameSortModes.ByGenre:        this.sortByGenre();          break
            case GameSortModes.ByPlaytime:     this.sortByPlaytime();       break
            case GameSortModes.ByRating:       this.sortByRating();         break
        }
    }

    public sortByGenre(): void {
        const games = DataManager.getInstance().get<SteamGameData[]>('steam.games') ?? []

        if (games.length === 0) {
            GameSorter.logger.warn('sortByGenre called but no games in DataManager — skipping emit')
            return
        }

        const sortedGames: ReadonlyArray<Readonly<SteamGameData>> =
            [...games].sort((a, b) => {
                const ga = primaryGenre(a as SteamGameData)
                const gb = primaryGenre(b as SteamGameData)
                // Use the shared comparator but construct items on the fly
                // since 'genre' is a computed property, not a primitive on SteamGameData
                return sortByGenreThenPlaytime(
                    { genre: ga, playtime_forever: a.playtime_forever },
                    { genre: gb, playtime_forever: b.playtime_forever }
                )
            })

        EventManager.getInstance().emit<GamesSortEvent>(GameEventTypes.GamesSort, {
            sortedGames,
            buckets: this.buildGenreBucketMap(sortedGames),
            sortMode: 'by-genre',
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
            buckets: this.buildPlaytimeBucketMap(sortedGames),
            sortMode: GameSortModes.ByPlaytime,
        })

        GameSorter.logger.debug(`GamesSort emitted (by playtime): ${sortedGames.length} games`)
    }

    public sortByRating(): void {
        const games = DataManager.getInstance().get<SteamGameData[]>('steam.games') ?? []

        if (games.length === 0) {
            GameSorter.logger.warn('sortByRating called but no games in DataManager — skipping emit')
            return
        }

        const sortedGames: ReadonlyArray<Readonly<SteamGameData>> =
            [...games].sort(sortByNumericField<SteamGameData>('userscore', 'playtime_forever'))

        EventManager.getInstance().emit<GamesSortEvent>(GameEventTypes.GamesSort, {
            sortedGames,
            buckets: this.buildRatingBucketMap(sortedGames),
            sortMode: GameSortModes.ByRating,
        })

        GameSorter.logger.debug(`GamesSort emitted (by rating): ${sortedGames.length} games`)
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
            sortMode: 'recently-played',
        })

        GameSorter.logger.debug(
            `GamesSort emitted: ${sortedGames.length} games, ${buckets.size} buckets`
        )
    }

    private buildPlaytimeBucketMap(
        sortedGames: ReadonlyArray<Readonly<SteamGameData>>
    ): ReadonlyMap<string, string> {
        const buckets = new Map<string, string>()
        for (const game of sortedGames) {
            const bucket = getPlaytimeBucket(game as SteamGameData)
            if (!buckets.has(bucket)) {
                buckets.set(bucket, getPlaytimeBucketLabel(bucket))
            }
        }
        return buckets
    }

    private buildRatingBucketMap(
        sortedGames: ReadonlyArray<Readonly<SteamGameData>>
    ): ReadonlyMap<string, string> {
        const thresholds: ReadonlyArray<{ minScore: number; key: string; label: string }> = [
            { minScore: 90, key: 'overwhelmingly-positive', label: 'Overwhelmingly Positive' },
            { minScore: 80, key: 'very-positive',           label: 'Very Positive' },
            { minScore: 70, key: 'mostly-positive',         label: 'Mostly Positive' },
            { minScore:  1, key: 'mixed',                   label: 'Mixed or Lower' },
            { minScore:  0, key: 'unrated',                 label: 'Unrated' },
        ]

        const buckets = new Map<string, string>()
        for (const game of sortedGames) {
            const score = game.userscore ?? 0
            const tier = thresholds.find(t => score >= t.minScore)!
            if (!buckets.has(tier.key)) {
                buckets.set(tier.key, tier.label)
            }
        }
        return buckets
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
