import * as THREE from 'three'
import { EventManager } from '../../core/EventManager'
import { Logger } from '../../utils/Logger'
import {
    StorePropsEventTypes,
    GameEventTypes,
    UIEventTypes,
    type ShelfReadyEvent,
    type ShelfLayoutDeterminedEvent,
    type StorePropsProgressEvent,
} from '../../types/InteractionEvents'
import { LayoutRegistry } from '../props/shared/LayoutRegistry'
import type { LayoutMode, SectionShelfInfo, ShelfInfo } from '../../types/LayoutTypes'
import type { ISectionAwareLayoutDefinition } from '../props/shared/ILayoutDefinition'
import type { SectionsReadyEvent } from '../../types/EnvironmentEvents'
import { GameLayoutConstants } from '../props/shared/GameBoxUtils'

/** Slots-per-shelf: used to convert game count → shelf count per section. */
const SLOTS_PER_SHELF = GameLayoutConstants.GAMES_PER_SURFACE * GameLayoutConstants.SURFACES_PER_SHELF
// CONFIG-CANDIDATE(layout-capacity): expose as lighting/layout tuning once section streaming is implemented.
const MAX_SHELVES_PER_ROW = 12

/**
 * ShelfLayoutCoordinator
 *
 * Singleton, non-disposable coordinator. Listens to SectionsReady and computes
 * the spatial layout for all shelves across all sections.
 *
 * Sections drive shelf count: ceil(section.games.length / SLOTS_PER_SHELF) shelves
 * are allocated per section, placed contiguously within the active layout geometry.
 *
 * Emits:
 *   - ShelfLayoutDetermined  once per layout run, with shelfBounds + stockStrategy
 *   - ShelfReady             one per shelf, tagged with shelfIndex + sectionIndex
 */
export class ShelfLayoutCoordinator {
    private static readonly logger = Logger.createLogFunctions(ShelfLayoutCoordinator.name)
    private static instance: ShelfLayoutCoordinator | null = null

    /** Active layout mode. Set by orchestration before the next SectionsReady fires. */
    public layoutMode: LayoutMode

    private computedLayoutMode: LayoutMode | null = null
    private shelvesByIndex = new Map<number, { position: THREE.Vector3; rotationY: number; sectionIndex: number }>()
    private emittedShelfIndices = new Set<number>()
    private totalShelves = 0

    static getInstance(initialLayoutMode: LayoutMode = 'arc'): ShelfLayoutCoordinator {
        if (!ShelfLayoutCoordinator.instance) {
            ShelfLayoutCoordinator.instance = new ShelfLayoutCoordinator(initialLayoutMode)
        }
        return ShelfLayoutCoordinator.instance
    }

    private constructor(layoutMode: LayoutMode) {
        this.layoutMode = layoutMode
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.SectionsReady,
            (event: CustomEvent<SectionsReadyEvent>) => this.handleSectionsReady(event.detail)
        )
        EventManager.getInstance().registerEventHandler(
            UIEventTypes.ArrangementRequested,
            () => this.clearRunState()
        )
        EventManager.getInstance().registerEventHandler(
            UIEventTypes.LayoutRequested,
            () => this.clearRunState()
        )
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.LibraryReloadRequest,
            () => this.clearRunState()
        )
        ShelfLayoutCoordinator.logger.debug(`Constructed in ${layoutMode} mode`)
    }

    private clearRunState(): void {
        this.shelvesByIndex.clear()
        this.emittedShelfIndices.clear()
        this.totalShelves = 0
        this.computedLayoutMode = null
    }

    private handleSectionsReady(detail: SectionsReadyEvent): void {
        this.clearRunState()
        this.computedLayoutMode = this.layoutMode

        ShelfLayoutCoordinator.logger.debug(
            `Layout start: layoutMode=${this.layoutMode}, incomingSections=${detail.sections.length}`
        )

        // Filter out sections with zero games to prevent empty shelves from being spawned.
        // Keep original section indices so downstream placement/signage mappings remain stable.
        const nonEmptySections = detail.sections.filter(s => s.games.length > 0)

        if (nonEmptySections.length === 0) {
            ShelfLayoutCoordinator.logger.warn('No shelves to lay out — all sections empty')
            return
        }

        // Compute total shelves across all sections
        const shelvesPerSection = nonEmptySections.map(s =>
            Math.max(1, Math.ceil(s.games.length / SLOTS_PER_SHELF))
        )
        this.totalShelves = shelvesPerSection.reduce((sum, n) => sum + n, 0)

        ShelfLayoutCoordinator.logger.debug(
            `Layout sections: nonEmptySections=${nonEmptySections.length}, totalShelves=${this.totalShelves}`
        )

        ShelfLayoutCoordinator.logger.debug(
            `Computing ${this.layoutMode} layout: ${this.totalShelves} shelves across ${nonEmptySections.length} non-empty sections`
        )

        const activeLayout = LayoutRegistry[this.layoutMode]
        const isSectionAwareLayout = 'computeShelvesForSections' in activeLayout
        const shelves = isSectionAwareLayout
            ? (activeLayout as ISectionAwareLayoutDefinition)
                .computeShelvesForSections(detail.sections)
                .filter(shelf => detail.sections[shelf.sectionIndex]?.games.length > 0)
            : this.computeShelvesByLinearSectionOwnership(activeLayout.computeShelves(this.totalShelves), shelvesPerSection)

        // Build bounds and section-tagged shelf map
        const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
        const hw = 2.0 / 2, hd = 1.0 / 2

        for (let shelfIndex = 0; shelfIndex < shelves.length; shelfIndex++) {
            const shelf = shelves[shelfIndex]
            bounds.minX = Math.min(bounds.minX, shelf.position.x - hw)
            bounds.maxX = Math.max(bounds.maxX, shelf.position.x + hw)
            bounds.minZ = Math.min(bounds.minZ, shelf.position.z - hd)
            bounds.maxZ = Math.max(bounds.maxZ, shelf.position.z + hd)
            this.shelvesByIndex.set(shelfIndex, {
                position: shelf.position.clone(),
                rotationY: shelf.rotationY,
                sectionIndex: shelf.sectionIndex,
            })
        }

        // Emit ShelfReady first so consumers (GameBoxSpawner) have shelf positions cached
        // before ShelfLayoutDetermined triggers placement.
        let emitted = 0
        for (const [idx, shelf] of this.shelvesByIndex) {
            this.emittedShelfIndices.add(idx)
            EventManager.getInstance().emit<StorePropsProgressEvent>(StorePropsEventTypes.Progress, {
                step: 'shelves',
                current: idx + 1,
                total: this.totalShelves,
                detail: `Placing shelf ${idx + 1}`,
            })
            EventManager.getInstance().emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, {
                shelfIndex: idx,
                sectionIndex: shelf.sectionIndex,
                position: shelf.position.clone(),
                rotationY: shelf.rotationY,
            })
            emitted++
        }

        ShelfLayoutCoordinator.logger.debug(`Emitted ShelfReady count=${emitted}`)

        // ShelfLayoutDetermined fires after ShelfReady so GameBoxSpawner has positions
        // when placement is triggered by the strategy arriving.
        const shelvesPerRow = this.deriveShelvesPerRow(shelves)
        const rowCount = Math.max(1, Math.ceil(shelves.length / shelvesPerRow))

        EventManager.getInstance().emit<ShelfLayoutDeterminedEvent>(
            GameEventTypes.ShelfLayoutDetermined,
            {
                layoutMode: this.layoutMode,
                shelfBounds: bounds,
                shelfLayout: {
                    rows: rowCount,
                    shelvesPerRow,
                },
                stockStrategy: LayoutRegistry[this.layoutMode].createStockStrategy(),
            }
        )

        ShelfLayoutCoordinator.logger.debug(
            `Emitted ShelfLayoutDetermined rows=${rowCount}, shelvesPerRow=${shelvesPerRow}`
        )

        ShelfLayoutCoordinator.logger.debug(`ShelfReady emitted for ${emitted} shelves, layout determined`)
    }

    private deriveShelvesPerRow(shelves: ReadonlyArray<SectionShelfInfo>): number {
        if (shelves.length === 0) return 1

        const shelfCountByRow = new Map<number, number>()
        for (const shelf of shelves) {
            shelfCountByRow.set(shelf.row, (shelfCountByRow.get(shelf.row) ?? 0) + 1)
        }

        const widestRow = Math.max(...shelfCountByRow.values())
        return Math.min(MAX_SHELVES_PER_ROW, Math.max(1, widestRow))
    }

    private computeShelvesByLinearSectionOwnership(
        shelves: ReadonlyArray<ShelfInfo>,
        shelvesPerSection: ReadonlyArray<number>
    ): SectionShelfInfo[] {
        const sectionShelves: SectionShelfInfo[] = []
        let shelfIndex = 0

        for (let sectionIndex = 0; sectionIndex < shelvesPerSection.length; sectionIndex++) {
            const count = shelvesPerSection[sectionIndex]
            for (let indexInSection = 0; indexInSection < count && shelfIndex < shelves.length; indexInSection++, shelfIndex++) {
                sectionShelves.push({
                    ...shelves[shelfIndex],
                    sectionIndex,
                })
            }
        }

        return sectionShelves
    }
}
