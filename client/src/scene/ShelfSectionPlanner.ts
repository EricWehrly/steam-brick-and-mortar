/**
 * ShelfSectionPlanner
 *
 * Accumulates game data across progressive batches, then places
 * category signs in one pass after all batches complete.
 *
 * Signs appear only after planSections() � no provisional signs during load.
 * planSections() is re-runnable: safe to call after filter/sort changes.
 */

import * as THREE from 'three'
import { EventManager } from '../core/EventManager'
import { StorePropsEventTypes, type BatchReadyForPlacementEvent } from '../types/InteractionEvents'
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
        // Self-register for batch events so callers don't need to invoke onBatchPlaced
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.BatchReadyForPlacement,
            this.handleBatchReady.bind(this)
        )
    }

    /** Accumulate games from one batch. Called from event handler; private by design. */
    private onBatchPlaced(games: readonly SteamGameData[]): void {
        this.games.push(...games)
    }

    private handleBatchReady(event: CustomEvent<BatchReadyForPlacementEvent>): void {
        this.onBatchPlaced(event.detail.games as readonly SteamGameData[])
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
            ShelfSectionPlanner.logger.warn('planSections called with no games � skipping')
            return
        }
        if (shelfPositions.length === 0) {
            ShelfSectionPlanner.logger.warn('planSections called with no shelf positions � skipping')
            return
        }

        this.signSystem.clearAll()

        const groups = this.assigner.assign(this.games)
        ShelfSectionPlanner.logger.info(
            `[SIGN-DEBUG] planSections: ${groups.length} groups � ` +
            groups.map(g => `${g.label}(${g.games.length})`).join(', ')
        )
        let placed = 0
        let gameOffset = 0
        const batchSize = 18
        let lastUsedAnchor = -1  // ensures each genre gets a unique shelf position

        for (const group of groups) {
            // Skip 'Other' � catch-all for tools/servers, not useful as a section sign
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

            this.signSystem.setSign({
                label: group.label,
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

    public reset(): void {
        this.games = []
        this.signSystem.clearAll()
    }

    public dispose(): void {
        this.signSystem.dispose()
    }
}
