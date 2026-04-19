import type { LayoutMode } from '../../../types/LayoutTypes'
import { ArcStockStrategy } from './ArcLayoutUtils'
import { RowStockStrategy } from './RowLayoutUtils'
import { SpokeStockStrategy } from './SpokeLayoutUtils'
import type { IStockStrategy } from './StockStrategy'

const strategyFactories: Record<LayoutMode, () => IStockStrategy> = {
    arc: () => new ArcStockStrategy(),
    row: () => new RowStockStrategy(),
    spoke: () => new SpokeStockStrategy(),
}

export function createStockStrategy(layoutMode: LayoutMode): IStockStrategy {
    return (strategyFactories[layoutMode] ?? strategyFactories.arc)()
}
