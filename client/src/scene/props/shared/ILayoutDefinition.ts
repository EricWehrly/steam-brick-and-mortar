/**
 * ILayoutDefinition
 *
 * Single interface that a layout module must satisfy. Replaces the split between
 * StockStrategyRegistry (strategy creation) and ShelfLayoutCoordinator.layoutComputers
 * (geometry computation) with a single Record<LayoutMode, ILayoutDefinition>.
 *
 * Each layout utils file exports a const implementing this interface.
 * LayoutRegistry collects them into Record<LayoutMode, ILayoutDefinition>.
 *
 * Lives here (not in types/LayoutTypes.ts) to avoid a circular import:
 *   LayoutTypes -> IStockStrategy -> StockSurface -> LayoutTypes
 */

import type { LayoutMode, ShelfInfo, SectionShelfInfo, Section } from '../../../types/LayoutTypes'
import type { IStockStrategy } from './StockStrategy'

export interface ILayoutDefinition {
    readonly mode: LayoutMode
    createStockStrategy(): IStockStrategy
    computeShelves(totalShelves: number): ShelfInfo[]
}

/**
 * Optional extension for layouts that can derive shelves directly from sections.
 */
export interface ISectionAwareLayoutDefinition extends ILayoutDefinition {
    computeShelvesForSections(sections: ReadonlyArray<Section>): SectionShelfInfo[]
}
