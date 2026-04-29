/**
 * GroupResolver
 *
 * Stage A of the two-stage arrangement pipeline.
 *
 * Partitions a flat game list into named Section[]s based on the active GroupMode.
 * Does NOT sort within sections — that is SectionSorter's job.
 *
 * 'none' → one unnamed section containing all games.
 * All other modes → N sections, one per group bucket.
 */

import type { SteamGameData } from '../game-box/types/GameData'
import type { Section } from '../../types/LayoutTypes'
import { GroupModes } from '../../types/LayoutTypes'
import type { GroupMode, SortMode } from '../../types/LayoutTypes'
import { KNOWN_GENRES, groupByGenre, primaryGenre } from './GameSortFunctions'
import { getTopSteamSpyTags } from '../../steam/utils/SteamSpyTags'

// ─── Recency bucket helpers ──────────────────────────────────────────────────

export enum RecentlyPlayedBucket {
    Today     = 'today',
    ThisWeek  = 'this-week',
    ThisMonth = 'this-month',
    ThisYear  = 'this-year',
    Before    = 'before',
    Unplayed  = 'unplayed',
}

const RECENCY_BUCKET_LABELS: Record<RecentlyPlayedBucket, string> = {
    [RecentlyPlayedBucket.Today]:     'Played Today',
    [RecentlyPlayedBucket.ThisWeek]:  'Played This Week',
    [RecentlyPlayedBucket.ThisMonth]: 'Played This Month',
    [RecentlyPlayedBucket.ThisYear]:  'Played This Year',
    [RecentlyPlayedBucket.Before]:    'Played Before',
    [RecentlyPlayedBucket.Unplayed]:  'Never Played',
}

export function getRecencyBucket(game: SteamGameData, nowSeconds?: number): RecentlyPlayedBucket {
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

// ─── Playtime bucket helpers ─────────────────────────────────────────────────

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

export function getPlaytimeBucket(game: SteamGameData): PlaytimeBucket {
    const minutes = game.playtime_forever ?? 0
    if (minutes === 0)     return PlaytimeBucket.Unplayed
    if (minutes <   60)   return PlaytimeBucket.Minimal
    if (minutes <   600)  return PlaytimeBucket.Light
    if (minutes <  6_000) return PlaytimeBucket.Moderate
    return PlaytimeBucket.Heavy
}

// ─── Rating bucket helpers ────────────────────────────────────────────────────

export const RATING_TIERS = [
    { minScore: 90, key: 'overwhelmingly-positive', label: 'Overwhelmingly Positive' },
    { minScore: 80, key: 'very-positive',           label: 'Very Positive' },
    { minScore: 70, key: 'mostly-positive',         label: 'Mostly Positive' },
    { minScore:  1, key: 'mixed',                   label: 'Mixed or Lower' },
    { minScore:  0, key: 'unrated',                 label: 'Unrated' },
] as const



// ─── GroupResolver ────────────────────────────────────────────────────────────

/**
 * Partition `games` into Section[]s based on `groupMode`.
 * Games within each section are returned in their original input order —
 * call SectionSorter afterwards to apply the active SortMode.
 *
 * @param sortMode  Passed through onto each Section for downstream provenance tracking.
 */
export function resolveGroups(
    games: SteamGameData[],
    groupMode: GroupMode,
    sortMode: SortMode
): Section[] {
    switch (groupMode) {
        case GroupModes.None:
            return [{ name: '', games, groupMode, sortMode }]

        case GroupModes.ByGenre:
            return groupByGenreMode(games, groupMode, sortMode)

        case GroupModes.ByRecency:
            return groupByRecencyMode(games, groupMode, sortMode)

        case GroupModes.ByPlaytime:
            return groupByPlaytimeMode(games, groupMode, sortMode)

        case GroupModes.ByRating:
            return groupByRatingMode(games, groupMode, sortMode)

        case GroupModes.ByTag:
            return groupByTagMode(games, groupMode, sortMode)
    }
}

function groupByGenreMode(games: SteamGameData[], groupMode: GroupMode, sortMode: SortMode): Section[] {
    const grouped = groupByGenre(games)
    const sections: Section[] = []
    for (const genre of KNOWN_GENRES) {
        const group = grouped.get(genre)
        if (!group || group.length === 0) continue
        sections.push({ name: genre, games: group, groupMode, sortMode })
    }
    const other = grouped.get('Other')
    if (other && other.length > 0) {
        sections.push({ name: 'Other', games: other, groupMode, sortMode })
    }
    return sections
}

function groupByRecencyMode(games: SteamGameData[], groupMode: GroupMode, sortMode: SortMode): Section[] {
    const bucketOrder = [
        RecentlyPlayedBucket.Today,
        RecentlyPlayedBucket.ThisWeek,
        RecentlyPlayedBucket.ThisMonth,
        RecentlyPlayedBucket.ThisYear,
        RecentlyPlayedBucket.Before,
        RecentlyPlayedBucket.Unplayed,
    ]
    const groups = new Map<RecentlyPlayedBucket, SteamGameData[]>()
    for (const game of games) {
        const bucket = getRecencyBucket(game)
        if (!groups.has(bucket)) groups.set(bucket, [])
        groups.get(bucket)!.push(game)
    }
    return bucketOrder
        .filter(b => groups.has(b))
        .map(b => ({ name: RECENCY_BUCKET_LABELS[b], games: groups.get(b)!, groupMode, sortMode }))
}

function groupByPlaytimeMode(games: SteamGameData[], groupMode: GroupMode, sortMode: SortMode): Section[] {
    const bucketOrder = [
        PlaytimeBucket.Heavy,
        PlaytimeBucket.Moderate,
        PlaytimeBucket.Light,
        PlaytimeBucket.Minimal,
        PlaytimeBucket.Unplayed,
    ]
    const groups = new Map<PlaytimeBucket, SteamGameData[]>()
    for (const game of games) {
        const bucket = getPlaytimeBucket(game)
        if (!groups.has(bucket)) groups.set(bucket, [])
        groups.get(bucket)!.push(game)
    }
    return bucketOrder
        .filter(b => groups.has(b))
        .map(b => ({ name: PLAYTIME_BUCKET_LABELS[b], games: groups.get(b)!, groupMode, sortMode }))
}

function groupByRatingMode(games: SteamGameData[], groupMode: GroupMode, sortMode: SortMode): Section[] {
    const groups = new Map<string, SteamGameData[]>()
    for (const game of games) {
        const score = game.userscore ?? 0
        const tier = RATING_TIERS.find(t => score >= t.minScore)!
        if (!groups.has(tier.key)) groups.set(tier.key, [])
        groups.get(tier.key)!.push(game)
    }
    return RATING_TIERS
        .filter(t => groups.has(t.key))
        .map(t => ({ name: t.label, games: groups.get(t.key)!, groupMode, sortMode }))
}

function groupByTagMode(games: SteamGameData[], groupMode: GroupMode, sortMode: SortMode): Section[] {
    const groups = new Map<string, SteamGameData[]>()

    for (const game of games) {
        const topTags = game.steamspy_top_tags?.length
            ? game.steamspy_top_tags
            : getTopSteamSpyTags(game.steamspy_tags)
        const uniqueTags = [...new Set(topTags)]

        if (uniqueTags.length === 0) continue

        for (const tag of uniqueTags) {
            if (!groups.has(tag)) groups.set(tag, [])
            groups.get(tag)!.push(game)
        }
    }

    return [...groups.keys()]
        .sort((a, b) => {
            const countDiff = groups.get(b)!.length - groups.get(a)!.length
            if (countDiff !== 0) return countDiff
            return a.localeCompare(b, undefined, { sensitivity: 'base' })
        })
        .map(tag => ({ name: tag, games: groups.get(tag)!, groupMode, sortMode }))
}
