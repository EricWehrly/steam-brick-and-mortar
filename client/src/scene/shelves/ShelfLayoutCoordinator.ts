import * as THREE from 'three'
import { EventManager } from '../../core/EventManager'
import { Logger } from '../../utils/Logger'
import {
    StorePropsEventTypes,
    GameEventTypes,
    type ShelfReadyEvent,
    type ShelfLayoutDeterminedEvent,
    type StorePropsProgressEvent,
} from '../../types/InteractionEvents'
import { LayoutRegistry } from '../props/shared/LayoutRegistry'
import type { LayoutMode, Section } from '../../types/LayoutTypes'
import type { SectionsReadyEvent } from '../../types/EnvironmentEvents'

/** Slots-per-shelf: used to convert game count → shelf count per section. */
const SLOTS_PER_SHELF = 18

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
            StorePropsEventTypes.ClearRequest,
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

        // Compute total shelves across all sections
        const shelvesPerSection = detail.sections.map(s =>
            Math.max(1, Math.ceil(s.games.length / SLOTS_PER_SHELF))
        )
        this.totalShelves = shelvesPerSection.reduce((sum, n) => sum + n, 0)

        if (this.totalShelves === 0) {
            ShelfLayoutCoordinator.logger.warn('No shelves to lay out — all sections empty')
            return
        }

        ShelfLayoutCoordinator.logger.debug(
            `Computing ${this.layoutMode} layout: ${this.totalShelves} shelves across ${detail.sections.length} sections`
        )

        const shelves = LayoutRegistry[this.layoutMode].computeShelves(this.totalShelves)

        // Build bounds and section-tagged shelf map
        const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
        const hw = 2.0 / 2, hd = 1.0 / 2
        let shelfIndex = 0
        for (let sectionIndex = 0; sectionIndex < shelvesPerSection.length; sectionIndex++) {
            const count = shelvesPerSection[sectionIndex]
            for (let i = 0; i < count; i++, shelfIndex++) {
                const s = shelves[shelfIndex]
                bounds.minX = Math.min(bounds.minX, s.position.x - hw)
                bounds.maxX = Math.max(bounds.maxX, s.position.x + hw)
                bounds.minZ = Math.min(bounds.minZ, s.position.z - hd)
                bounds.maxZ = Math.max(bounds.maxZ, s.position.z + hd)
                this.shelvesByIndex.set(shelfIndex, {
                    position: s.position.clone(),
                    rotationY: s.rotationY,
                    sectionIndex,
                })
            }
        }

        EventManager.getInstance().emit<ShelfLayoutDeterminedEvent>(
            GameEventTypes.ShelfLayoutDetermined,
            {
                shelfBounds: bounds,
                shelfLayout: { rows: (shelves[shelves.length - 1]?.row ?? 0) + 1 },
                stockStrategy: LayoutRegistry[this.layoutMode].createStockStrategy(),
            }
        )

        // Emit ShelfReady for every shelf now that positions are computed
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

        ShelfLayoutCoordinator.logger.debug(`ShelfReady emitted for ${emitted} shelves`)
    }
}
