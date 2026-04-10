/**
 * GameSorter
 *
 * Listens for AllBatchesComplete, reads the full game list from DataManager,
 * sorts games and builds a bucket map, then emits GameEventTypes.GamesSort.
 *
 * Consumers (sign managers, UI layers) subscribe to GamesSort instead of
 * re-running the same sort/bucket logic independently.
 */

import { EventManager } from '../../core/EventManager'
import { DataManager } from '../../core/data/DataManager'
import { Logger } from '../../utils/Logger'
import {
    GameEventTypes,
    type AllBatchesCompleteEvent,
    type GamesSortEvent,
} from '../../types/InteractionEvents'
import type { SteamGameData } from '../game-box/types/GameData'
import {
    sortByRecentlyPlayed,
    getRecentlyPlayedBucket,
    getBucketLabel,
    RecentlyPlayedBucket,
} from './CategoryAssigner'

export class GameSorter {
    private static readonly logger = Logger.createLogFunctions(GameSorter.name)

    constructor() {
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.AllBatchesComplete,
            (_event: CustomEvent<AllBatchesCompleteEvent>) => this.handleAllBatchesComplete()
        )
        GameSorter.logger.debug('GameSorter initialized — subscribed to AllBatchesComplete')
    }

    private handleAllBatchesComplete(): void {
        const games = DataManager.getInstance().get<SteamGameData[]>('steam.games') ?? []

        if (games.length === 0) {
            GameSorter.logger.warn('GameSorter: AllBatchesComplete fired but no games in DataManager — skipping emit')
            return
        }

        const hasRecentlyPlayedData = games.some(g => (g.rtime_last_played ?? 0) > 0)

        const sortedGames: ReadonlyArray<Readonly<SteamGameData>> = hasRecentlyPlayedData
            ? [...games].sort(sortByRecentlyPlayed)
            : [...games]

        const buckets = this.buildBucketMap(sortedGames, hasRecentlyPlayedData)

        const payload: GamesSortEvent = {
            sortedGames,
            buckets,
            hasRecentlyPlayedData,
        }

        EventManager.getInstance().emit<GamesSortEvent>(GameEventTypes.GamesSort, payload)
        GameSorter.logger.debug(
            `GamesSort emitted: ${sortedGames.length} games, ${buckets.size} buckets, hasRecentlyPlayed=${hasRecentlyPlayedData}`
        )
    }

    /**
     * Build a map from bucket key → display label.
     * For recently-played stores: keys are RecentlyPlayedBucket enum values.
     * For anonymous/curated stores (no rtime): returns an empty map.
     */
    private buildBucketMap(
        sortedGames: ReadonlyArray<Readonly<SteamGameData>>,
        hasRecentlyPlayedData: boolean
    ): ReadonlyMap<number | string, string> {
        const buckets = new Map<number | string, string>()
        if (!hasRecentlyPlayedData) return buckets

        for (const game of sortedGames) {
            const bucket = getRecentlyPlayedBucket(game)
            if (bucket !== RecentlyPlayedBucket.Unplayed && !buckets.has(bucket)) {
                buckets.set(bucket, getBucketLabel(bucket))
            }
        }

        return buckets
    }
}
