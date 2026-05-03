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
import type { LayoutMode } from '../types/LayoutTypes'

export interface ShelfSignPlannerConfig {
    signYOffset?: number
    signMountStyle?: SignMount['style']
}

const SHELF_SIGN_Y_OFFSET = 2.02
const SHELF_SIGN_MOUNT_STYLE: SignMount['style'] = 'above-shelf'
const SHELF_SIGN_FRONT_OFFSET = 0.28
const ROW_AISLE_MIN_GAP_METRES = 2.4
export class ShelfSignPlanner {
    private static readonly logger = Logger.createLogFunctions(ShelfSignPlanner.name)

    private get signSystem(): SceneSignManager { return SceneSignManager.instance }
    private readonly config: Required<ShelfSignPlannerConfig>

    private shelfPositions: THREE.Vector3[] = []
    private shelfRotations: number[] = []
    private shelfSectionIndices: number[] = []
    private pendingSections: SectionsReadyEvent | null = null
    private pendingSectionRunId: number | null = null
    private activeLayoutMode: LayoutMode | null = null
    private readonly placedSignIdentifiers = new Set<string>()
    private sectionRunCounter = 0

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

        if (detail.shelfIndex < 4 || detail.shelfIndex % 10 === 0) {
            ShelfSignPlanner.logger.info(
                `[ShelfSignAnchor] shelf=${detail.shelfIndex}, section=${detail.sectionIndex}, knownAnchors=${this.shelfPositions.filter(Boolean).length}`
            )
        }
    }

    private resetSignAnchorsForLayoutSetup(_detail: StorePropsSetupRequestEvent): void {
        // SetupRequest can fire during startup after signs are already placed.
        // We only reset shelf anchor caches here; sign cleanup is owned by the next
        // placement run (placeSignsForSections) or explicit library reload.
        this.shelfPositions = []
        this.shelfRotations = []
        this.shelfSectionIndices = []
        this.activeLayoutMode = null
        ShelfSignPlanner.logger.debug('Cleared shelf anchors only (setup request)')
    }

    private resetSignAnchorsForLibraryReload(): void {
        this.shelfPositions = []
        this.shelfRotations = []
        this.shelfSectionIndices = []
        this.pendingSections = null
        this.pendingSectionRunId = null
        this.activeLayoutMode = null
        this.clearSigns()
        ShelfSignPlanner.logger.debug('Cleared shelf positions and signs (library reload)')
    }

    private stageSectionSigns(detail: SectionsReadyEvent): void {
        const sectionRunId = ++this.sectionRunCounter
        const nonEmptySections = detail.sections.filter(section => section.games.length > 0).length
        this.pendingSections = detail
        this.pendingSectionRunId = sectionRunId

        ShelfSignPlanner.logger.info(
            `[ShelfSign#${sectionRunId}] staged SectionsReady: totalSections=${detail.sections.length}, nonEmptySections=${nonEmptySections}, knownAnchors=${this.shelfPositions.filter(Boolean).length}`
        )
    }

    private applyStagedSignsWhenLayoutReady(_detail: ShelfLayoutDeterminedEvent): void {
        const stagedRunId = this.pendingSectionRunId
        ShelfSignPlanner.logger.info(
            `[ShelfSign#${stagedRunId ?? 'none'}] ShelfLayoutDetermined received: layoutMode=${_detail.layoutMode}, hasPendingSections=${this.pendingSections !== null}, knownAnchors=${this.shelfPositions.filter(Boolean).length}`
        )

        if (!this.pendingSections) {
            return
        }

        this.activeLayoutMode = _detail.layoutMode ?? null

        this.placeSignsForSections(this.pendingSections)
        this.pendingSections = null
        this.pendingSectionRunId = null
    }

    private placeSignsForSections(detail: SectionsReadyEvent): void {
        const { sections } = detail
        const stagedRunId = this.pendingSectionRunId
        this.clearSigns()

        ShelfSignPlanner.logger.info(
            `[ShelfSign#${stagedRunId ?? 'none'}] placeSignsForSections start: sections=${sections.length}, knownAnchors=${this.shelfPositions.filter(Boolean).length}`
        )

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

            ShelfSignPlanner.logger.info(
                `[ShelfSign#${stagedRunId ?? 'none'}] placed start sign: id=${startIdentifier}, shelf=${startShelfIndex}`
            )

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
                ShelfSignPlanner.logger.info(
                    `[ShelfSign#${stagedRunId ?? 'none'}] placed end sign: id=${endIdentifier}, shelf=${endShelfIndex}`
                )
            }
        }

        if (this.activeLayoutMode === 'row') {
            this.placeRowAisleEdgeSigns(sections)
        }

        ShelfSignPlanner.logger.debug(
            `Placed ${this.placedSignIdentifiers.size} signs across ${sections.length} sections`
        )
        ShelfSignPlanner.logger.info(
            `[ShelfSign#${stagedRunId ?? 'none'}] complete: placed=${this.placedSignIdentifiers.size}`
        )
    }

    private placeRowAisleEdgeSigns(sections: ReadonlyArray<{ name: string }>): void {
        type RowAnchor = { shelfIndex: number; position: THREE.Vector3; rotationY: number }
        const rowAnchorsByZ = new Map<number, RowAnchor[]>()

        for (let shelfIndex = 0; shelfIndex < this.shelfPositions.length; shelfIndex++) {
            const position = this.shelfPositions[shelfIndex]
            if (!position) {
                continue
            }
            const rowZKey = Math.round(position.z * 100)
            const anchors = rowAnchorsByZ.get(rowZKey) ?? []
            anchors.push({
                shelfIndex,
                position,
                rotationY: this.shelfRotations[shelfIndex] ?? 0,
            })
            rowAnchorsByZ.set(rowZKey, anchors)
        }

        for (const [rowZKey, rowAnchors] of rowAnchorsByZ) {
            const leftInnerAnchor = rowAnchors
                .filter(anchor => anchor.position.x < 0)
                .sort((a, b) => b.position.x - a.position.x)[0]
            const rightInnerAnchor = rowAnchors
                .filter(anchor => anchor.position.x > 0)
                .sort((a, b) => a.position.x - b.position.x)[0]

            if (!leftInnerAnchor || !rightInnerAnchor) {
                continue
            }

            const aisleGapWidth = rightInnerAnchor.position.x - leftInnerAnchor.position.x
            if (aisleGapWidth < ROW_AISLE_MIN_GAP_METRES) {
                continue
            }

            this.placeRowAisleSignForAnchor(rowZKey, leftInnerAnchor, 'left', sections)
            this.placeRowAisleSignForAnchor(rowZKey, rightInnerAnchor, 'right', sections)
        }
    }

    private placeRowAisleSignForAnchor(
        rowZKey: number,
        anchor: { shelfIndex: number; position: THREE.Vector3; rotationY: number },
        side: 'left' | 'right',
        sections: ReadonlyArray<{ name: string }>
    ): void {
        const sectionIndex = this.shelfSectionIndices[anchor.shelfIndex]
        const sectionName = sections[sectionIndex]?.name
        if (!sectionName || sectionName === 'Other') {
            return
        }

        const uniqueIdentifier = `row-aisle-${rowZKey}-${side}`
        this.signSystem.placeSign('canvas', {
            uniqueIdentifier,
            text: sectionName,
            anchorPosition: anchor.position,
            mount: {
                style: this.config.signMountStyle,
                yOffset: this.config.signYOffset,
                frontOffset: SHELF_SIGN_FRONT_OFFSET,
                signFacingY: anchor.rotationY,
            },
            style: { ...SignStyles.Category, fontSize: 0.12, padding: '0.05 0.08' },
        })
        this.placedSignIdentifiers.add(uniqueIdentifier)
    }

    private clearSigns(): void {
        if (this.placedSignIdentifiers.size > 0) {
            ShelfSignPlanner.logger.info(
                `[ShelfSign] clearing existing signs: count=${this.placedSignIdentifiers.size}`
            )
        }
        for (const uniqueIdentifier of this.placedSignIdentifiers) {
            this.signSystem.removeSignById(uniqueIdentifier)
        }
        this.placedSignIdentifiers.clear()
    }

    public reset(): void {
        this.shelfPositions = []
        this.shelfRotations = []
        this.shelfSectionIndices = []
        this.activeLayoutMode = null
        this.clearSigns()
        this.signSystem.clearAll()
    }

    public dispose(): void {
        this.signSystem.dispose()
    }
}
