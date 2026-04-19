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
import type { AllBatchesCompleteEvent, SortRequestedEvent, SectionsReadyEvent } from '../../types/EnvironmentEvents'
import type { Section } from '../../types/LayoutTypes'
import type { SteamGameData } from '../game-box/types/GameData'
import { sortByNumericField, primaryGenre, KNOWN_GENRES, sortByGenreThenPlaytime, groupByGenre } from './GameSortFunctions'
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

        // Group by genre, sort within each group by playtime descending.
        const grouped = groupByGenre([...games] as SteamGameData[])
        const sections: Section[] = []
        for (const genre of KNOWN_GENRES) {
            const group = grouped.get(genre)
            if (!group || group.length === 0) continue
            sections.push({
                name: genre,
                games: [...group].sort((a, b) =>
                    (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0)
                ),
                sortMode: GameSortModes.ByGenre,
            })
        }
        // Append 'Other' at end if present
        const other = grouped.get('Other')
        if (other && other.length > 0) {
            sections.push({
                name: 'Other',
                games: [...other].sort((a, b) =>
                    (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0)
                ),
                sortMode: GameSortModes.ByGenre,
            })
        }

        EventManager.getInstance().emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, {
            sections,
            sortMode: GameSortModes.ByGenre,
        })
        GameSorter.logger.debug(`SectionsReady emitted (by genre): ${sections.length} sections, ${games.length} games`)
    }

    public sortByPlaytime(): void {
        const games = DataManager.getInstance().get<SteamGameData[]>('steam.games') ?? []
        if (games.length === 0) {
            GameSorter.logger.warn('sortByPlaytime called but no games in DataManager — skipping emit')
            return
        }

        const sorted = [...games].sort(sortByNumericField<SteamGameData>('playtime_forever'))
        const sections: Section[] = this.buildPlaytimeSections(sorted)

        EventManager.getInstance().emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, {
            sections,
            sortMode: GameSortModes.ByPlaytime,
        })
        GameSorter.logger.debug(`SectionsReady emitted (by playtime): ${sections.length} sections, ${games.length} games`)
    }

    public sortByRating(): void {
        const games = DataManager.getInstance().get<SteamGameData[]>('steam.games') ?? []
        if (games.length === 0) {
            GameSorter.logger.warn('sortByRating called but no games in DataManager — skipping emit')
            return
        }

        const sorted = [...games].sort(sortByNumericField<SteamGameData>('userscore', 'playtime_forever'))
        const sections: Section[] = this.buildRatingSections(sorted)

        EventManager.getInstance().emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, {
            sections,
            sortMode: GameSortModes.ByRating,
        })
        GameSorter.logger.debug(`SectionsReady emitted (by rating): ${sections.length} sections, ${games.length} games`)
    }

    public sortByRecentlyPlayed(): void {
        const games = DataManager.getInstance().get<SteamGameData[]>('steam.games') ?? []
        if (games.length === 0) {
            GameSorter.logger.warn('AllBatchesComplete fired but no games in DataManager — skipping emit')
            return
        }

        const sorted = [...games].sort(sortByNumericField<SteamGameData>('rtime_last_played', 'playtime_forever'))
        const sections: Section[] = this.buildRecentlyPlayedSections(sorted)

        EventManager.getInstance().emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, {
            sections,
            sortMode: GameSortModes.RecentlyPlayed,
        })
        GameSorter.logger.debug(`SectionsReady emitted (recently played): ${sections.length} sections, ${games.length} games`)
    }

    private buildPlaytimeSections(sorted: SteamGameData[]): Section[] {
        const bucketOrder = [
            PlaytimeBucket.Heavy,
            PlaytimeBucket.Moderate,
            PlaytimeBucket.Light,
            PlaytimeBucket.Minimal,
            PlaytimeBucket.Unplayed,
        ]
        const groups = new Map<PlaytimeBucket, SteamGameData[]>()
        for (const game of sorted) {
            const bucket = getPlaytimeBucket(game)
            if (!groups.has(bucket)) groups.set(bucket, [])
            groups.get(bucket)!.push(game)
        }
        return bucketOrder
            .filter(b => groups.has(b))
            .map(b => ({
                name: getPlaytimeBucketLabel(b),
                games: groups.get(b)!,
                sortMode: GameSortModes.ByPlaytime,
            }))
    }

    private buildRatingSections(sorted: SteamGameData[]): Section[] {
        const tiers = [
            { minScore: 90, key: 'overwhelmingly-positive', label: 'Overwhelmingly Positive' },
            { minScore: 80, key: 'very-positive',           label: 'Very Positive' },
            { minScore: 70, key: 'mostly-positive',         label: 'Mostly Positive' },
            { minScore:  1, key: 'mixed',                   label: 'Mixed or Lower' },
            { minScore:  0, key: 'unrated',                 label: 'Unrated' },
        ] as const
        const groups = new Map<string, SteamGameData[]>()
        for (const game of sorted) {
            const score = game.userscore ?? 0
            const tier = tiers.find(t => score >= t.minScore)!
            if (!groups.has(tier.key)) groups.set(tier.key, [])
            groups.get(tier.key)!.push(game)
        }
        return tiers
            .filter(t => groups.has(t.key))
            .map(t => ({
                name: t.label,
                games: groups.get(t.key)!,
                sortMode: GameSortModes.ByRating,
            }))
    }

    private buildRecentlyPlayedSections(sorted: SteamGameData[]): Section[] {
        const bucketOrder = [
            RecentlyPlayedBucket.Today,
            RecentlyPlayedBucket.ThisWeek,
            RecentlyPlayedBucket.ThisMonth,
            RecentlyPlayedBucket.ThisYear,
            RecentlyPlayedBucket.Before,
            RecentlyPlayedBucket.Unplayed,
        ]
        const groups = new Map<RecentlyPlayedBucket, SteamGameData[]>()
        for (const game of sorted) {
            const bucket = getRecentlyPlayedBucket(game)
            if (!groups.has(bucket)) groups.set(bucket, [])
            groups.get(bucket)!.push(game)
        }
        return bucketOrder
            .filter(b => groups.has(b))
            .map(b => ({
                name: getBucketLabel(b),
                games: groups.get(b)!,
                sortMode: GameSortModes.RecentlyPlayed,
            }))
    }
}
