/**
 * ShelfSectionPlanner
 *
 * Listens for SectionsReady and places signs at section boundaries.
 * Each section carries its own name and game list — no re-derivation of group
 * boundaries from a flat sorted list needed.
 *
 * Also caches shelf positions from ShelfReady so signs can be anchored correctly
 * both on initial load and on re-sort.
 */

import * as THREE from 'three'
import { EventManager } from '../core/EventManager'
import {
    GameEventTypes,
    StorePropsEventTypes,
    type ShelfReadyEvent,
} from '../types/InteractionEvents'
import type { SectionsReadyEvent } from '../types/EnvironmentEvents'
import { SceneSignManager, SignStyles } from './SceneSignManager'
import type { SignMount } from './SignTypes'
import { Logger } from '../utils/Logger'

export interface ShelfSectionPlannerConfig {
    signYOffset?: number
    signMountStyle?: SignMount['style']
}

const SHELF_SIGN_Y_OFFSET = 2.02
const SHELF_SIGN_MOUNT_STYLE: SignMount['style'] = 'above-shelf'
const SHELF_SIGN_FRONT_OFFSET = 0.28
const SHELF_BATCH_SIZE = 18

export class ShelfSectionPlanner {
    private static readonly logger = Logger.createLogFunctions(ShelfSectionPlanner.name)

    private get signSystem(): SceneSignManager { return SceneSignManager.instance }
    private readonly config: Required<ShelfSectionPlannerConfig>

    private shelfPositions: THREE.Vector3[] = []
    private shelfRotations: number[] = []
    private pendingSections: SectionsReadyEvent | null = null
    private readonly placedSignIdentifiers = new Set<string>()

    constructor(config: ShelfSectionPlannerConfig = {}) {
        this.config = {
            signYOffset: config.signYOffset ?? SHELF_SIGN_Y_OFFSET,
            signMountStyle: config.signMountStyle ?? SHELF_SIGN_MOUNT_STYLE,
        }
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.SectionsReady,
            (event: CustomEvent<SectionsReadyEvent>) => this.handleSectionsReady(event.detail)
        )
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.ShelfReady,
            (event: CustomEvent<ShelfReadyEvent>) => this.handleShelfReady(event.detail)
        )
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.ClearRequest,
            () => this.handleClearRequest()
        )
    }

    private handleShelfReady(detail: ShelfReadyEvent): void {
        this.shelfPositions[detail.shelfIndex] = (detail.position as THREE.Vector3).clone()
        this.shelfRotations[detail.shelfIndex] = detail.rotationY ?? 0
        this.tryPlacePendingSections()
    }

    private handleClearRequest(): void {
        this.shelfPositions = []
        this.shelfRotations = []
        this.pendingSections = null
        this.clearSigns()
    }

    private handleSectionsReady(detail: SectionsReadyEvent): void {
        this.pendingSections = detail

        ShelfSectionPlanner.logger.info(
            `SectionsReady: ${detail.sections.length} section(s), ` +
            `${this.shelfPositions.length} shelf positions known`
        )

        this.tryPlacePendingSections()
    }

    private tryPlacePendingSections(): void {
        if (!this.pendingSections) {
            return
        }

        const requiredShelves = this.pendingSections.sections
            .map(section => Math.max(1, Math.ceil(section.games.length / SHELF_BATCH_SIZE)))
            .reduce((sum, count) => sum + count, 0)

        if (this.shelfPositions.length < requiredShelves) {
            return
        }

        this.placeSignsForSections(this.pendingSections)
        this.pendingSections = null
    }

    private placeSignsForSections(detail: SectionsReadyEvent): void {
        const { sections } = detail
        this.clearSigns()

        // Walk sections in order, placing a sign at the first shelf of each section.
        // Sections with no name (ungrouped) or named 'Other' get no sign.
        let shelfCursor = 0

        for (const section of sections) {
            const anchorShelfIndex = shelfCursor

            // Advance cursor by how many shelves this section occupies
            const shelvesUsed = Math.ceil(section.games.length / SHELF_BATCH_SIZE)
            shelfCursor += Math.max(shelvesUsed, 1)

            // Skip nameless or catch-all sections
            if (!section.name || section.name === 'Other') continue

            const anchorPos = this.shelfPositions[anchorShelfIndex]
            if (!anchorPos) {
                ShelfSectionPlanner.logger.warn(`No shelf position at index ${anchorShelfIndex} for section "${section.name}"`)
                continue
            }

            const rotY = this.shelfRotations[anchorShelfIndex] ?? 0

            // Use name as identifier — unique per section within a layout
            const uniqueIdentifier = section.name
            this.signSystem.placeSign('canvas', {
                uniqueIdentifier,
                anchorPosition: anchorPos,
                mount: {
                    style: this.config.signMountStyle,
                    yOffset: this.config.signYOffset,
                    frontOffset: SHELF_SIGN_FRONT_OFFSET,
                    signFacingY: rotY,
                },
                style: { ...SignStyles.Category, fontSize: 0.16, padding: '0.08 0.14' },
            })
            this.placedSignIdentifiers.add(uniqueIdentifier)
        }

        ShelfSectionPlanner.logger.debug(
            `Placed ${this.placedSignIdentifiers.size} signs across ${sections.length} sections`
        )
    }

    private clearSigns(): void {
        for (const uniqueIdentifier of this.placedSignIdentifiers) {
            this.signSystem.removeSignById(uniqueIdentifier)
        }
        this.placedSignIdentifiers.clear()
    }

    public reset(): void {
        this.shelfPositions = []
        this.shelfRotations = []
        this.clearSigns()
        this.signSystem.clearAll()
    }

    public dispose(): void {
        this.signSystem.dispose()
    }
}
