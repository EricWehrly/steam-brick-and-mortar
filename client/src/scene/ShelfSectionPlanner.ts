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
    private shelfSectionIndices: number[] = []
    private pendingSections: SectionsReadyEvent | null = null
    private readonly placedSignIdentifiers = new Set<string>()

    private buildSignIdentifier(sectionName: string, edge: 'start' | 'end'): string {
        return `${sectionName}::${edge}`
    }

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
            StorePropsEventTypes.LayoutClearRequest,
            () => this.handleClearRequest()
        )
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.LibraryReloadRequest,
            () => this.handleClearRequest()
        )
    }

    private handleShelfReady(detail: ShelfReadyEvent): void {
        this.shelfPositions[detail.shelfIndex] = (detail.position as THREE.Vector3).clone()
        this.shelfRotations[detail.shelfIndex] = detail.rotationY ?? 0
        this.shelfSectionIndices[detail.shelfIndex] = detail.sectionIndex
        this.tryPlacePendingSections()
    }

    private handleClearRequest(): void {
        this.shelfPositions = []
        this.shelfRotations = []
        this.shelfSectionIndices = []
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

        const knownShelfCount = this.shelfSectionIndices.filter((sectionIndex) => sectionIndex !== undefined).length
        if (knownShelfCount < requiredShelves) {
            return
        }

        this.placeSignsForSections(this.pendingSections)
        this.pendingSections = null
    }

    private placeSignsForSections(detail: SectionsReadyEvent): void {
        const { sections } = detail
        this.clearSigns()

        // Place a sign at the first shelf owned by each section index.
        // Sections with no name (ungrouped) or named 'Other' get no sign.
        for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
            const section = sections[sectionIndex]
            if (!section.name || section.name === 'Other') {
                continue
            }

            const anchorShelfIndex = this.shelfSectionIndices.findIndex((ownedSectionIndex) => ownedSectionIndex === sectionIndex)
            if (anchorShelfIndex < 0) {
                ShelfSectionPlanner.logger.warn(`No shelf anchor found for section "${section.name}" (index ${sectionIndex})`)
                continue
            }

            const anchorPos = this.shelfPositions[anchorShelfIndex]
            if (!anchorPos) {
                ShelfSectionPlanner.logger.warn(`No shelf position at index ${anchorShelfIndex} for section "${section.name}"`)
                continue
            }

            const rotY = this.shelfRotations[anchorShelfIndex] ?? 0

            const endShelfIndex = this.findLastOwnedShelfIndex(sectionIndex)
            const endAnchorPos = endShelfIndex >= 0 ? this.shelfPositions[endShelfIndex] : null
            const endRotY = endShelfIndex >= 0 ? (this.shelfRotations[endShelfIndex] ?? rotY) : rotY

            const startIdentifier = this.buildSignIdentifier(section.name, 'start')
            this.signSystem.placeSign('canvas', {
                uniqueIdentifier: startIdentifier,
                text: section.name,
                anchorPosition: anchorPos,
                mount: {
                    style: this.config.signMountStyle,
                    yOffset: this.config.signYOffset,
                    frontOffset: SHELF_SIGN_FRONT_OFFSET,
                    signFacingY: rotY,
                },
                style: { ...SignStyles.Category, fontSize: 0.16, padding: '0.08 0.14' },
            })
            this.placedSignIdentifiers.add(startIdentifier)

            if (endAnchorPos) {
                const endIdentifier = this.buildSignIdentifier(section.name, 'end')
                this.signSystem.placeSign('canvas', {
                    uniqueIdentifier: endIdentifier,
                    text: section.name,
                    anchorPosition: endAnchorPos,
                    mount: {
                        style: this.config.signMountStyle,
                        yOffset: this.config.signYOffset,
                        frontOffset: SHELF_SIGN_FRONT_OFFSET,
                        signFacingY: endRotY,
                    },
                    style: { ...SignStyles.Category, fontSize: 0.16, padding: '0.08 0.14' },
                })
                this.placedSignIdentifiers.add(endIdentifier)
            }
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

    private findLastOwnedShelfIndex(sectionIndex: number): number {
        for (let index = this.shelfSectionIndices.length - 1; index >= 0; index--) {
            if (this.shelfSectionIndices[index] === sectionIndex) {
                return index
            }
        }
        return -1
    }

    public reset(): void {
        this.shelfPositions = []
        this.shelfRotations = []
        this.shelfSectionIndices = []
        this.clearSigns()
        this.signSystem.clearAll()
    }

    public dispose(): void {
        this.signSystem.dispose()
    }
}
