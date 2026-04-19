/**
 * LayoutRegistry
 *
 * Single source of truth for all layout definitions.
 * Replaces both StockStrategyRegistry and ShelfLayoutCoordinator.layoutComputers.
 *
 * To add a new layout:
 *   1. Create a utils file implementing ILayoutDefinition (strategy + geometry).
 *   2. Add an entry here.
 *   3. Add the mode literal to LayoutMode in types/LayoutTypes.ts.
 *   Nothing else needs changing.
 */

import type { ILayoutDefinition } from './ILayoutDefinition'
import type { LayoutMode } from '../../../types/LayoutTypes'
import { ArcLayout } from './ArcLayoutUtils'
import { RowLayout } from './RowLayoutUtils'
import { SpokeLayout } from './SpokeLayoutUtils'

export const LayoutRegistry: Record<LayoutMode, ILayoutDefinition> = {
    arc: ArcLayout,
    row: RowLayout,
    spoke: SpokeLayout,
}
