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
    type ShelfReadyEvent,
} from '../types/InteractionEvents'
import type { GamesSortEvent, GameSortMode } from '../types/EnvironmentEvents'
import { groupByGenre, KNOWN_GENRES, type ShelfGroup } from './categorization/GameSortFunctions'
import { RecentlyPlayedBucket } from './categorization/GameSorter'
import { SceneSignManager, SignStyles } from './SceneSignManager'
import type { SignMount } from './SignTypes'
import type { SteamGameData } from './game-box/types/GameData'
import {
    shelfBucket,
    shouldPlaceBucketSign,
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

    private sortedGames: ReadonlyArray<Readonly<SteamGameData>> = []
    private shelfPositions: THREE.Vector3[] = []
    private shelfRotations: number[] = []
    private sortMode: GameSortMode = 'recently-played'
    private lastPlacedBucket: RecentlyPlayedBucket | null = null
    private readonly placedBucketIdentifiers = new Set<string>()
    private readonly placedSectionIdentifiers = new Set<string>()

    constructor(config: ShelfSectionPlannerConfig = {}) {
        this.config = {
            signYOffset: config.signYOffset ?? DEFAULT_SIGN_Y_OFFSET,
            signMountStyle: config.signMountStyle ?? DEFAULT_MOUNT_STYLE,
        }
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.GamesSort,
            (event: CustomEvent<GamesSortEvent>) => this.handleGamesSort(event.detail)
        )
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.ShelfReady,
            (event: CustomEvent<ShelfReadyEvent>) => this.handleShelfReady(event.detail)
        )
    }

    private handleGamesSort(detail: GamesSortEvent): void {
        this.sortedGames = detail.sortedGames
        this.sortMode = detail.sortMode
        this.lastPlacedBucket = null

        this.removeBucketSigns()
        this.removeSectionSigns()

        ShelfSectionPlanner.logger.info(
            `GamesSort received: mode=${this.sortMode}, ` +
            `${this.sortedGames.length} sorted games, ` +
            `${this.shelfPositions.length} shelf positions known`
        )

        if (this.shelfPositions.length === 0) {
            ShelfSectionPlanner.logger.warn('No shelf positions yet — signs will be placed on first ShelfReady')
            return
        }

        if (this.sortMode === 'by-genre') {
            this.planSections(this.shelfPositions)
        } else {
            this.replayBucketSigns()
        }
    }

    private removeSectionSigns(): void {
        for (const uniqueIdentifier of this.placedSectionIdentifiers) {
            this.signSystem.removeSignById(uniqueIdentifier)
        }
        this.placedSectionIdentifiers.clear()
    }

    private replayBucketSigns(): void {
        const sortedEntries = [...this.shelfPositions.entries()]
            .filter(([, pos]) => pos !== undefined)
            .sort(([indexA], [indexB]) => indexA - indexB)
        for (const [shelfId, shelfPosition] of sortedEntries) {
            const rotY = this.shelfRotations[shelfId] ?? 0
            this.placeTimeBucketSignForShelf(shelfId, shelfPosition, rotY)
        }
    }

    private handleShelfReady(detail: ShelfReadyEvent): void {
        const shelfPos = detail.position as THREE.Vector3
        const rotY = detail.rotationY ?? 0
        this.shelfPositions[detail.batchIndex] = shelfPos.clone()
        this.shelfRotations[detail.batchIndex] = rotY

        if (this.sortMode === 'by-genre' || this.sortedGames.length === 0) return
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
        if (!shouldPlaceBucketSign(bucket, this.lastPlacedBucket)) return

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
     * Place genre section signs using sortedGames (the fully-resolved list from GameSorter).
     *
     * Uses sortedGames rather than the raw batch accumulation because sortedGames
     * comes from DataManager where app details (including genres) are fully loaded.
     * The batch accumulation may lack genre data at placement time.
     *
     * Each genre group is anchored to the shelf where its games start in sorted order.
     * A minimum-advance rule ensures each group gets a unique shelf position even
     * when multiple small groups would naturally map to the same index.
     *
     * 'Other' is skipped — it's a catch-all for tools/servers with no navigation value.
     */
    public planSections(shelfPositions: THREE.Vector3[]): void {
        if (this.sortedGames.length === 0) {
            ShelfSectionPlanner.logger.warn('planSections called with no sorted games — skipping')
            return
        }
        if (shelfPositions.length === 0) {
            ShelfSectionPlanner.logger.warn('planSections called with no shelf positions — skipping')
            return
        }

        const gamesWithGenres = this.sortedGames.filter(g => g.genres && g.genres.length > 0).length
        ShelfSectionPlanner.logger.info(
            `planSections: ${this.sortedGames.length} sorted games, ` +
            `${gamesWithGenres} have genre data, ` +
            `${this.shelfPositions.length} shelves`
        )

        const groups = this.buildShelfGroups([...this.sortedGames] as SteamGameData[])
        ShelfSectionPlanner.logger.info(
            `genre groups: [${groups.map(g => `${g.label}(${g.games.length})`).join(', ')}]`
        )
        let placed = 0
        let gameOffset = 0
        const batchSize = 18
        let lastUsedAnchor = -1

        for (const group of groups) {
            if (group.label === 'Other') {
                gameOffset += group.games.length
                continue
            }

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
                mount: { style: this.config.signMountStyle, yOffset: this.config.signYOffset },
            })
            this.placedSectionIdentifiers.add(group.label)
            placed++
            gameOffset += group.games.length
        }

        ShelfSectionPlanner.logger.debug(
            `planSections complete: ${placed}/${groups.length} signs ` +
            `(${this.sortedGames.length} sorted games, ${shelfPositions.length} shelves)`
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
        this.sortedGames = []
        this.shelfPositions = []
        this.shelfRotations = []
        this.sortMode = 'recently-played'
        this.lastPlacedBucket = null
        this.placedBucketIdentifiers.clear()
        this.placedSectionIdentifiers.clear()
        this.signSystem.clearAll()
    }

    public dispose(): void {
        this.signSystem.dispose()
    }
}
