/**
 * ShelfSignPlanner
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
    type ShelfLayoutDeterminedEvent,
    type StorePropsSetupRequestEvent,
} from '../types/InteractionEvents'
import type { SectionsReadyEvent } from '../types/EnvironmentEvents'
import { SceneSignManager, SignStyles } from './SceneSignManager'
import type { SignMount } from './SignTypes'
import { Logger } from '../utils/Logger'

export interface ShelfSignPlannerConfig {
    signYOffset?: number
    signMountStyle?: SignMount['style']
}

const SHELF_SIGN_Y_OFFSET = 2.02
const SHELF_SIGN_MOUNT_STYLE: SignMount['style'] = 'above-shelf'
const SHELF_SIGN_FRONT_OFFSET = 0.28
export class ShelfSignPlanner {
    private static readonly logger = Logger.createLogFunctions(ShelfSignPlanner.name)

    private get signSystem(): SceneSignManager { return SceneSignManager.instance }
    private readonly config: Required<ShelfSignPlannerConfig>

    private shelfPositions: THREE.Vector3[] = []
    private shelfRotations: number[] = []
    private shelfSectionIndices: number[] = []
    private pendingSections: SectionsReadyEvent | null = null
    private readonly placedSignIdentifiers = new Set<string>()

    private buildSignIdentifier(sectionName: string, edge: 'start' | 'end'): string {
        return `${sectionName}::${edge}`
    }

    constructor(config: ShelfSignPlannerConfig = {}) {
        this.config = {
            signYOffset: config.signYOffset ?? SHELF_SIGN_Y_OFFSET,
            signMountStyle: config.signMountStyle ?? SHELF_SIGN_MOUNT_STYLE,
        }
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.SectionsReady,
            (event: CustomEvent<SectionsReadyEvent>) => this.stageSectionSigns(event.detail)
        )
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.ShelfReady,
            (event: CustomEvent<ShelfReadyEvent>) => this.recordShelfAnchor(event.detail)
        )
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.ShelfLayoutDetermined,
            (event: CustomEvent<ShelfLayoutDeterminedEvent>) => this.applyStagedSignsWhenLayoutReady(event.detail)
        )
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.SetupRequest,
            (event: CustomEvent<StorePropsSetupRequestEvent>) => this.resetSignAnchorsForLayoutSetup(event.detail)
        )
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.LibraryReloadRequest,
            () => this.resetSignAnchorsForLibraryReload()
        )
    }

    private recordShelfAnchor(detail: ShelfReadyEvent): void {
        this.shelfPositions[detail.shelfIndex] = (detail.position as THREE.Vector3).clone()
        this.shelfRotations[detail.shelfIndex] = detail.rotationY ?? 0
        this.shelfSectionIndices[detail.shelfIndex] = detail.sectionIndex
    }

    private resetSignAnchorsForLayoutSetup(_detail: StorePropsSetupRequestEvent): void {
        // Layout mode rebuild boundary: discard stale shelf anchors so sign placement
        // for the next SectionsReady run can only use fresh ShelfReady data.
        this.shelfPositions = []
        this.shelfRotations = []
        this.shelfSectionIndices = []
        this.pendingSections = null
        this.clearSigns()
        ShelfSignPlanner.logger.debug('Cleared shelf positions and signs (setup request)')
    }

    private resetSignAnchorsForLibraryReload(): void {
        this.shelfPositions = []
        this.shelfRotations = []
        this.shelfSectionIndices = []
        this.pendingSections = null
        this.clearSigns()
        ShelfSignPlanner.logger.debug('Cleared shelf positions and signs (library reload)')
    }

    private stageSectionSigns(detail: SectionsReadyEvent): void {
        this.pendingSections = detail

        ShelfSignPlanner.logger.info(
            `SectionsReady: ${detail.sections.length} section(s), ` +
            `${this.shelfPositions.filter(Boolean).length} shelf positions known`
        )
    }

    private applyStagedSignsWhenLayoutReady(_detail: ShelfLayoutDeterminedEvent): void {
        if (!this.pendingSections) {
            return
        }

        this.placeSignsForSections(this.pendingSections)
        this.pendingSections = null
    }

    private placeSignsForSections(detail: SectionsReadyEvent): void {
        const { sections } = detail
        this.clearSigns()

        // Place signs at the first and last shelf owned by each section index.
        // Sections with no name (ungrouped) or named 'Other' get no sign.
        for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
            const section = sections[sectionIndex]
            if (!section.name || section.name === 'Other') {
                continue
            }

            const ownedShelfIndices = this.shelfSectionIndices
                .map((ownedSectionIndex, shelfIndex) => ({ ownedSectionIndex, shelfIndex }))
                .filter((entry) => entry.ownedSectionIndex === sectionIndex && !!this.shelfPositions[entry.shelfIndex])
                .map((entry) => entry.shelfIndex)

            if (ownedShelfIndices.length === 0) {
                ShelfSignPlanner.logger.warn(`No shelf anchor found for section "${section.name}" (index ${sectionIndex})`)
                continue
            }

            const startShelfIndex = ownedShelfIndices[0]
            const endShelfIndex = ownedShelfIndices[ownedShelfIndices.length - 1]

            const startPos = this.shelfPositions[startShelfIndex]
            const endPos = this.shelfPositions[endShelfIndex]
            const startRotY = this.shelfRotations[startShelfIndex] ?? 0
            const endRotY = this.shelfRotations[endShelfIndex] ?? startRotY

            if (!startPos || !endPos) continue

            const startIdentifier = this.buildSignIdentifier(section.name, 'start')
            this.signSystem.placeSign('canvas', {
                uniqueIdentifier: startIdentifier,
                text: section.name,
                anchorPosition: startPos,
                mount: {
                    style: this.config.signMountStyle,
                    yOffset: this.config.signYOffset,
                    frontOffset: SHELF_SIGN_FRONT_OFFSET,
                    signFacingY: startRotY,
                },
                style: { ...SignStyles.Category, fontSize: 0.16, padding: '0.08 0.14' },
            })
            this.placedSignIdentifiers.add(startIdentifier)

            if (endShelfIndex !== startShelfIndex) {
                const endIdentifier = this.buildSignIdentifier(section.name, 'end')
                this.signSystem.placeSign('canvas', {
                    uniqueIdentifier: endIdentifier,
                    text: section.name,
                    anchorPosition: endPos,
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

        ShelfSignPlanner.logger.debug(
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
        this.shelfSectionIndices = []
        this.clearSigns()
        this.signSystem.clearAll()
    }

    public dispose(): void {
        this.signSystem.dispose()
    }
}
