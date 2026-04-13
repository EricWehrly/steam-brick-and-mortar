/**
 * ShelfSectionPlanner
 *
 * Accumulates game data across progressive batches, then places category signs
 * in one pass after all batches complete.
 *
 * Also owns time-bucket sign placement: listens for GamesSort to cache sorted
 * game data, then reacts to each ShelfReady event to place bucket transition
 * signs at the correct shelf boundary.
 *
 * Signs appear only after planSections() — no provisional signs during load.
 * planSections() is re-runnable: safe to call after filter/sort changes.
 */

import * as THREE from 'three'
import { EventManager } from '../core/EventManager'
import {
    GameEventTypes,
    StorePropsEventTypes,
    type BatchReadyForPlacementEvent,
    type ShelfReadyEvent,
} from '../types/InteractionEvents'
import type { GamesSortEvent } from '../types/EnvironmentEvents'
import { groupByGenre, KNOWN_GENRES, type ShelfGroup } from './categorization/GameSortFunctions'
import { RecentlyPlayedBucket } from './categorization/GameSorter'
import { SceneSignManager, SignStyles } from './SceneSignManager'
import type { SignMount } from './SignTypes'
import type { SteamGameData } from './game-box/types/GameData'
import {
    shelfBucket,
    shouldPlaceBucketSign,
    recentlyPlayedCeilingAnchor,
    bucketDisplayLabel,
} from './signs/TimeBucketSignHelpers'
import { Logger } from '../utils/Logger'

export interface ShelfSectionPlannerConfig {
    signYOffset?: number
    signMountStyle?: SignMount['style']
}

const DEFAULT_SIGN_Y_OFFSET = 0.2
const DEFAULT_MOUNT_STYLE: SignMount['style'] = 'above-shelf'
const BUCKET_SIGN_Y_OFFSET = 2.02
const BUCKET_SIGN_FRONT_OFFSET = 0.28

export class ShelfSectionPlanner {
    private static readonly logger = Logger.createLogFunctions(ShelfSectionPlanner.name)

    private get signSystem(): SceneSignManager { return SceneSignManager.instance }
    private readonly config: Required<ShelfSectionPlannerConfig>

    private games: SteamGameData[] = []
    private sortedGames: ReadonlyArray<Readonly<SteamGameData>> = []
    private shelfPositions: THREE.Vector3[] = []
    private lastPlacedBucket: RecentlyPlayedBucket | null = null
    private readonly placedBucketIdentifiers = new Set<string>()

    private get hasRecentlyPlayedData(): boolean {
        return this.sortedGames.some(game => (game.rtime_last_played ?? 0) > 0)
    }

    constructor(config: ShelfSectionPlannerConfig = {}) {
        this.config = {
            signYOffset: config.signYOffset ?? DEFAULT_SIGN_Y_OFFSET,
            signMountStyle: config.signMountStyle ?? DEFAULT_MOUNT_STYLE,
        }
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.BatchReadyForPlacement,
            this.handleBatchReady.bind(this)
        )
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.GamesSort,
            (event: CustomEvent<GamesSortEvent>) => this.handleGamesSort(event.detail)
        )
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.ShelfReady,
            (event: CustomEvent<ShelfReadyEvent>) => this.handleShelfReady(event.detail)
        )
    }

    private onBatchPlaced(games: readonly SteamGameData[]): void {
        this.games.push(...games)
    }

    private handleBatchReady(event: CustomEvent<BatchReadyForPlacementEvent>): void {
        this.onBatchPlaced(event.detail.games as readonly SteamGameData[])
    }

    private handleGamesSort(detail: GamesSortEvent): void {
        this.sortedGames = detail.sortedGames
        this.lastPlacedBucket = null
        this.removeBucketSigns()
        this.syncRecentlyPlayedCeilingSign()
        if (this.shelfPositions.length > 0) {
            this.planSections(this.shelfPositions)
        }
    }

    private syncRecentlyPlayedCeilingSign(): void {
        const uniqueIdentifier = 'Recently Played'
        if (!this.hasRecentlyPlayedData) {
            this.signSystem.removeSignById(uniqueIdentifier)
            return
        }
        this.signSystem.placeSign('canvas', {
            uniqueIdentifier,
            anchorPosition: recentlyPlayedCeilingAnchor(),
            mount: { style: 'ceiling', signFacingY: 0 },
            style: {
                backgroundColor: 0xd4a017,
                textColor: 0x003087,
                fontSize: 0.30,
                padding: '0.15 0.28',
            },
        })
    }

    private handleShelfReady(detail: ShelfReadyEvent): void {
        const shelfPos = detail.position as THREE.Vector3
        const rotY = detail.rotationY ?? 0
        this.shelfPositions[detail.batchIndex] = shelfPos.clone()

        if (!this.hasRecentlyPlayedData || this.sortedGames.length === 0) return
        this.placeTimeBucketSignForShelf(detail.batchIndex, shelfPos, rotY)
    }

    private removeBucketSigns(): void {
        for (const uniqueIdentifier of this.placedBucketIdentifiers) {
            this.signSystem.removeSignById(uniqueIdentifier)
        }
        this.placedBucketIdentifiers.clear()
    }

    private placeTimeBucketSignForShelf(shelfId: number, shelfPosition: THREE.Vector3, shelfRotationY: number): void {
        const bucket = shelfBucket(shelfId, this.sortedGames)
        if (!shouldPlaceBucketSign(bucket, this.lastPlacedBucket, shelfPosition, recentlyPlayedCeilingAnchor())) return

        const uniqueIdentifier = bucketDisplayLabel(bucket!)
        this.signSystem.placeSign('canvas', {
            uniqueIdentifier,
            anchorPosition: shelfPosition,
            mount: { style: 'above-shelf', yOffset: BUCKET_SIGN_Y_OFFSET, frontOffset: BUCKET_SIGN_FRONT_OFFSET, signFacingY: shelfRotationY },
            style: { ...SignStyles.Category, fontSize: 0.16, padding: '0.08 0.14' },
        })
        this.placedBucketIdentifiers.add(uniqueIdentifier)
        this.lastPlacedBucket = bucket!
    }

    /**
     * Place all category signs using the full accumulated game set.
     *
     * Each genre group is anchored to the shelf where its games start
     * in the playtime-sorted order. A minimum-advance rule ensures each
     * group gets a unique shelf even when multiple small groups would
     * otherwise map to the same position.
     *
     * "Other" is skipped � it's a catch-all for tools/dedicated servers
     * and adds no navigation value as a section sign.
     */
    public planSections(shelfPositions: THREE.Vector3[]): void {
        if (this.games.length === 0) {
            ShelfSectionPlanner.logger.warn('planSections called with no games — skipping')
            return
        }
        if (shelfPositions.length === 0) {
            ShelfSectionPlanner.logger.warn('planSections called with no shelf positions — skipping')
            return
        }

        this.signSystem.clearAll()

        const groups = this.buildShelfGroups(this.games)
        ShelfSectionPlanner.logger.info(
            `[SIGN-DEBUG] planSections: ${groups.length} groups — ` +
            groups.map(g => `${g.label}(${g.games.length})`).join(', ')
        )
        let placed = 0
        let gameOffset = 0
        const batchSize = 18
        let lastUsedAnchor = -1  // ensures each genre gets a unique shelf position

        for (const group of groups) {
            // Skip 'Other' — catch-all for tools/servers, not useful as a section sign
            if (group.label === 'Other') {
                gameOffset += group.games.length
                continue
            }

            // Compute natural anchor from game offset, then advance past any collision
            const naturalIndex = Math.floor(gameOffset / batchSize)
            const anchorIndex = Math.min(
                Math.max(naturalIndex, lastUsedAnchor + 1),
                shelfPositions.length - 1
            )
            lastUsedAnchor = anchorIndex

            const anchorPos = shelfPositions[anchorIndex]
            if (!anchorPos) {
                ShelfSectionPlanner.logger.warn(`No shelf position for group "${group.label}" at index ${anchorIndex}`)
                gameOffset += group.games.length
                continue
            }

            this.signSystem.placeSign('canvas', {
                uniqueIdentifier: group.label,
                anchorPosition: anchorPos,
                mount: { style: this.config.signMountStyle, yOffset: this.config.signYOffset }
            })
            placed++
            gameOffset += group.games.length
        }

        ShelfSectionPlanner.logger.info(
            `[SIGN-DEBUG] planSections complete: placed ${placed}/${groups.length} signs ` +
            `(${this.games.length} total games, ${shelfPositions.length} shelves)`
        )
    }

    private buildShelfGroups(games: SteamGameData[]): ShelfGroup[] {
        if (games.length === 0) return []
        const grouped = groupByGenre(games)
        const shelfGroups: ShelfGroup[] = Array.from(grouped.entries()).map(([genre, groupGames]) => ({
            genre,
            label: genre,
            games: groupGames,
        }))
        shelfGroups.sort((a, b) => {
            const ai = KNOWN_GENRES.indexOf(a.genre)
            const bi = KNOWN_GENRES.indexOf(b.genre)
            if (a.genre === 'Other') return 1
            if (b.genre === 'Other') return -1
            if (ai !== -1 && bi !== -1) return ai - bi
            if (ai !== -1) return -1
            if (bi !== -1) return 1
            return b.games.length - a.games.length
        })
        return shelfGroups
    }

    public reset(): void {
        this.games = []
        this.sortedGames = []
        this.shelfPositions = []
        this.lastPlacedBucket = null
        this.placedBucketIdentifiers.clear()
        this.signSystem.clearAll()
    }

    public dispose(): void {
        this.signSystem.dispose()
    }
}
