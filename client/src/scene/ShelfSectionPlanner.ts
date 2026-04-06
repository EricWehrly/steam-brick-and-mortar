/**
 * ShelfSectionPlanner
 *
 * Accumulates game data across progressive batches, then places
 * category signs in one pass after all batches complete.
 *
 * Signs appear only after planSections() — no provisional signs during load.
 * planSections() is re-runnable: safe to call after filter/sort changes.
 */

import * as THREE from 'three'
import { CategoryAssigner } from './categorization/CategoryAssigner'
import { CategorySignSystem, type SignMount } from './CategorySignSystem'
import type { SteamGameData } from './game-box/types/GameData'
import { Logger } from '../utils/Logger'

export interface ShelfSectionPlannerConfig {
    signYOffset?: number
    signMountStyle?: SignMount['style']
}

const DEFAULT_SIGN_Y_OFFSET = 2.2
const DEFAULT_MOUNT_STYLE: SignMount['style'] = 'above-shelf'

export class ShelfSectionPlanner {
    private static readonly logger = Logger.createLogFunctions(ShelfSectionPlanner.name)

    private readonly assigner = new CategoryAssigner()
    private readonly signSystem: CategorySignSystem
    private readonly config: Required<ShelfSectionPlannerConfig>

    private games: SteamGameData[] = []

    constructor(scene: THREE.Scene, config: ShelfSectionPlannerConfig = {}) {
        this.signSystem = new CategorySignSystem(scene)
        this.config = {
            signYOffset: config.signYOffset ?? DEFAULT_SIGN_Y_OFFSET,
            signMountStyle: config.signMountStyle ?? DEFAULT_MOUNT_STYLE,
        }
    }

    /**
     * Accumulate games from one batch.
     * Does NOT place any signs — signs are deferred to planSections().
     */
    public onBatchPlaced(
        _batchIndex: number,
        games: readonly SteamGameData[],
        _shelfPosition: THREE.Vector3,
        _shelfLabel?: string
    ): void {
        this.games.push(...games)
    }

    /**
     * Place all category signs using the full accumulated game set.
     * Each group is anchored to the shelf position where its games start
     * in the playtime-sorted order.
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

        const groups = this.assigner.assign(this.games)
        ShelfSectionPlanner.logger.info(
            `[SIGN-DEBUG] planSections: ${groups.length} groups — ` +
            groups.map(g => `${g.label}(${g.games.length})`).join(', ')
        )

        let placed = 0
        let gameOffset = 0
        const batchSize = 18

        for (const group of groups) {
            // Skip 'Other' — it's a catch-all for tools/servers without a proper genre.
            // Small groups also tend to cluster at the same anchor shelf as Other,
            // and a section sign for 'Other' adds noise without useful navigation value.
            if (group.label === 'Other') { gameOffset += group.games.length; continue }
            const anchorIndex = Math.min(
                Math.floor(gameOffset / batchSize),
                shelfPositions.length - 1
            )
            const anchorPos = shelfPositions[anchorIndex]
            if (!anchorPos) {
                ShelfSectionPlanner.logger.warn(`No shelf position for group "${group.label}" at index ${anchorIndex}`)
                gameOffset += group.games.length
                continue
            }

            this.signSystem.setSign({
                label: group.label,
                anchorPosition: anchorPos,
                mount: { style: this.config.signMountStyle, yOffset: this.config.signYOffset }
            })
            placed++
            gameOffset += group.games.length
        }

        ShelfSectionPlanner.logger.debug(
            `planSections: placed ${placed}/${groups.length} signs ` +
            `(${this.games.length} total games, ${shelfPositions.length} shelves)`
        )
    }

    public reset(): void {
        this.games = []
        this.signSystem.clearAll()
    }

    public dispose(): void {
        this.signSystem.dispose()
    }
}
