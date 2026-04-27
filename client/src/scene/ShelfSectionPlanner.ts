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
    type ShelfLayoutDeterminedEvent,
    type StorePropsSetupRequestEvent,
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
            GameEventTypes.ShelfLayoutDetermined,
            (event: CustomEvent<ShelfLayoutDeterminedEvent>) => this.handleShelfLayoutDetermined(event.detail)
        )
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.SetupRequest,
            (event: CustomEvent<StorePropsSetupRequestEvent>) => this.handleSetupRequest(event.detail)
        )
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.LibraryReloadRequest,
            () => this.handleLibraryReloadRequest()
        )
    }

    private handleShelfReady(detail: ShelfReadyEvent): void {
        this.shelfPositions[detail.shelfIndex] = (detail.position as THREE.Vector3).clone()
        this.shelfRotations[detail.shelfIndex] = detail.rotationY ?? 0
        this.shelfSectionIndices[detail.shelfIndex] = detail.sectionIndex
    }

    private handleSetupRequest(_detail: StorePropsSetupRequestEvent): void {
        // Layout mode rebuild boundary: discard stale shelf anchors so sign placement
        // for the next SectionsReady run can only use fresh ShelfReady data.
        this.shelfPositions = []
        this.shelfRotations = []
        this.shelfSectionIndices = []
        this.pendingSections = null
        this.clearSigns()
        ShelfSectionPlanner.logger.debug('Cleared shelf positions and signs (setup request)')
    }

    private handleLibraryReloadRequest(): void {
        this.shelfPositions = []
        this.shelfRotations = []
        this.shelfSectionIndices = []
        this.pendingSections = null
        this.clearSigns()
        ShelfSectionPlanner.logger.debug('Cleared shelf positions and signs (library reload)')
    }

    private handleSectionsReady(detail: SectionsReadyEvent): void {
        this.pendingSections = detail

        ShelfSectionPlanner.logger.info(
            `SectionsReady: ${detail.sections.length} section(s), ` +
            `${this.shelfPositions.filter(Boolean).length} shelf positions known`
        )
    }

    private handleShelfLayoutDetermined(_detail: ShelfLayoutDeterminedEvent): void {
        if (!this.pendingSections) {
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
        this.shelfSectionIndices = []
        this.clearSigns()
        this.signSystem.clearAll()
    }

    public dispose(): void {
        this.signSystem.dispose()
    }
}
