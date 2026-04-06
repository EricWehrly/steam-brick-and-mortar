/**
 * ShelfSectionPlanner
 *
 * ROLE: Middle-layer coordinator that maps loaded games to shelf sections
 * and drives category sign placement.
 *
 * OWNS:
 * - Game accumulation across progressive batches
 * - CategoryAssigner invocation over full library
 * - Section anchor tracking (first batch index per label)
 * - CategorySignSystem lifecycle calls
 *
 * DOES NOT:
 * - Know about shelf geometry or GPU instancing
 * - Know about batch events (caller passes data in)
 * - Decide shelf positions (caller provides shelfPositions[])
 *
 * DESIGN NOTE:
 * This lives between the batch pipeline and the sign/layout system.
 * It is intentionally re-runnable: calling `planSections()` at any time
 * rebuilds signs from the current accumulated game set, supporting
 * future filter/sort/label-change flows without a full reload.
 */

import * as THREE from 'three'
import { CategoryAssigner } from './categorization/CategoryAssigner'
import { CategorySignSystem, type SignMount } from './CategorySignSystem'
import type { SteamGameData } from './game-box/types/GameData'
import { Logger } from '../utils/Logger'

export interface ShelfSectionPlannerConfig {
    /** Y offset above shelf anchor for section signs */
    signYOffset?: number
    /** Mount style for section signs */
    signMountStyle?: SignMount['style']
}

const DEFAULT_SIGN_Y_OFFSET = 2.2
const DEFAULT_MOUNT_STYLE: SignMount['style'] = 'above-shelf'

export class ShelfSectionPlanner {
    private static readonly logger = Logger.createLogFunctions(ShelfSectionPlanner.name)

    private readonly assigner = new CategoryAssigner()
    private readonly signSystem: CategorySignSystem
    private readonly config: Required<ShelfSectionPlannerConfig>

    /** Accumulated games across all received batches */
    private games: SteamGameData[] = []

    /** First batch index observed for each label during progressive load */
    private firstBatchIndexByLabel: Map<string, number> = new Map()

    /** Labels for which provisional signs have already been shown */
    private provisionalLabels: Set<string> = new Set()

    constructor(scene: THREE.Scene, config: ShelfSectionPlannerConfig = {}) {
        this.signSystem = new CategorySignSystem(scene)
        this.config = {
            signYOffset: config.signYOffset ?? DEFAULT_SIGN_Y_OFFSET,
            signMountStyle: config.signMountStyle ?? DEFAULT_MOUNT_STYLE,
        }
    }

    // ─── Progressive load interface ───────────────────────────────────────────

    /**
     * Call once per batch as games stream in.
     * Adds games to the accumulator and optionally places a provisional sign
     * for non-Other labels on first occurrence.
     *
     * @param batchIndex  Index of this batch in the progressive sequence
     * @param games       Games in this batch
     * @param shelfPosition  World position of the shelf created for this batch
     * @param shelfLabel  Optional label pre-derived from batch genre (from GameBoxSpawner)
     */
    public onBatchPlaced(
        batchIndex: number,
        games: readonly SteamGameData[],
        shelfPosition: THREE.Vector3,
        shelfLabel?: string
    ): void {
        this.games.push(...games)

        if (!shelfLabel || shelfLabel === 'Other') return

        // Track first batch index for this label (used by planSections())
        if (!this.firstBatchIndexByLabel.has(shelfLabel)) {
            this.firstBatchIndexByLabel.set(shelfLabel, batchIndex)
        }

        // Show provisional sign on first occurrence of this label
        if (!this.provisionalLabels.has(shelfLabel)) {
            this.signSystem.setSign({
                label: shelfLabel,
                anchorPosition: shelfPosition,
                mount: { style: this.config.signMountStyle, yOffset: this.config.signYOffset }
            })
            this.provisionalLabels.add(shelfLabel)
            ShelfSectionPlanner.logger.debug(`Provisional sign: "${shelfLabel}" at batch ${batchIndex}`)
        }
    }

    /**
     * Rebuild all section signs using the full accumulated game set.
     * Safe to call multiple times — each call replaces previous signs.
     * Call this after all batches have landed, or after any filter/sort change.
     *
     * @param shelfPositions  Ordered world positions of all shelves (by batch index)
     */
    public planSections(shelfPositions: THREE.Vector3[]): void {
        if (this.games.length === 0) return

        this.signSystem.clearAll()
        this.provisionalLabels.clear()

        const groups = this.assigner.assign(this.games)
        let placed = 0

        for (const group of groups) {
            const firstBatchIndex = this.firstBatchIndexByLabel.get(group.label)
            const anchorIndex = firstBatchIndex !== undefined
                ? firstBatchIndex
                : this.estimateBatchAnchor(group.label, groups, shelfPositions.length)

            const anchorPos = shelfPositions[anchorIndex]
            if (!anchorPos) continue

            this.signSystem.setSign({
                label: group.label,
                anchorPosition: anchorPos,
                mount: { style: this.config.signMountStyle, yOffset: this.config.signYOffset }
            })
            this.provisionalLabels.add(group.label)
            placed++
        }

        ShelfSectionPlanner.logger.debug(
            `planSections: placed ${placed} signs for ${groups.length} groups ` +
            `(${this.games.length} total games)`
        )
    }

    // ─── Reset ────────────────────────────────────────────────────────────────

    /** Clear accumulated state. Call before a new load cycle. */
    public reset(): void {
        this.games = []
        this.firstBatchIndexByLabel.clear()
        this.provisionalLabels.clear()
        this.signSystem.clearAll()
    }

    public dispose(): void {
        this.signSystem.dispose()
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────

    /**
     * Fallback anchor estimation when first-batch tracking is unavailable
     * (e.g. for uncached batches where genre metadata wasn't set at dispatch time).
     * Uses batch-count proportional to group size.
     */
    private estimateBatchAnchor(
        label: string,
        groups: ReturnType<CategoryAssigner['assign']>,
        totalShelves: number
    ): number {
        let offset = 0
        const batchSize = 18
        for (const group of groups) {
            if (group.label === label) return Math.min(offset, totalShelves - 1)
            offset += Math.ceil(group.games.length / batchSize)
        }
        return 0
    }
}
