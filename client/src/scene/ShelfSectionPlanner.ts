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
        ShelfSectionPlanner.logger.debug('Cleared shelf positions and signs')
    }

    private handleSectionsReady(detail: SectionsReadyEvent): void {
        this.pendingSections = detail

        ShelfSectionPlanner.logger.info(
            `SectionsReady: ${detail.sections.length} section(s), ` +
            `${this.shelfPositions.filter(Boolean).length} shelf positions known`
        )

        this.tryPlacePendingSections()
    }

    private tryPlacePendingSections(): void {
        if (!this.pendingSections) {
            return
        }

        // Wait for ShelfLayoutDetermined to have fired at least once, which means
        // ShelfLayoutCoordinator has emitted all ShelfReady events for this run.
        // We check by waiting until we have at least one shelf position per section
        // that actually has games (sections with 0 games produce 1 shelf minimum).
        const knownShelvesPerSection = new Map<number, number>()
        for (const sectionIndex of this.shelfSectionIndices) {
            if (sectionIndex !== undefined) {
                knownShelvesPerSection.set(sectionIndex, (knownShelvesPerSection.get(sectionIndex) ?? 0) + 1)
            }
        }

        const totalSectionsWithShelves = knownShelvesPerSection.size
        const totalActiveSections = this.pendingSections.sections.filter(s => s.games.length > 0).length || this.pendingSections.sections.length

        if (totalSectionsWithShelves < totalActiveSections) {
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

    /**
     * Debug helper: place a sign on every known shelf position showing its
     * shelf index and section index. Useful for diagnosing spoke layout geometry.
     * Call from browser console: `window.__debugSectionPlanner?.labelAllShelves()`
     */
    public labelAllShelves(): void {
        for (let shelfIndex = 0; shelfIndex < this.shelfPositions.length; shelfIndex++) {
            const pos = this.shelfPositions[shelfIndex]
            const rotY = this.shelfRotations[shelfIndex] ?? 0
            const sectionIndex = this.shelfSectionIndices[shelfIndex] ?? -1
            if (!pos) continue

            const uniqueIdentifier = `debug-shelf-${shelfIndex}`
            const label = `s${sectionIndex}\u00b7${shelfIndex}`
            this.signSystem.placeSign('canvas', {
                uniqueIdentifier,
                text: label,
                anchorPosition: pos,
                mount: {
                    style: 'above-shelf',
                    yOffset: 1.2,
                    frontOffset: SHELF_SIGN_FRONT_OFFSET,
                    signFacingY: rotY,
                },
                style: { ...SignStyles.Category, fontSize: 0.10, padding: '0.04 0.08' },
            })
            this.placedSignIdentifiers.add(uniqueIdentifier)
        }
        ShelfSectionPlanner.logger.info(`Debug: placed labels on ${this.shelfPositions.filter(Boolean).length} shelves`)
    }
}
