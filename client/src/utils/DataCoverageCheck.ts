import { Logger } from './Logger'

const logger = Logger.createLogFunctions('DataCoverageCheck')

/**
 * Warns once (per call site) if zero items in a batch have a given field populated - a cheap
 * guard against wiring a UI element to a field that's silently never coming back from the data
 * pipeline. Direct request (2026-08-20), prompted by the game box's rating field: most boxes were
 * rendering "Unrated" not because Steam genuinely had no reviews for them, but because the field
 * feeding it was empty for the whole loaded batch and nobody had noticed. This doesn't replace
 * fixing the display bug itself (see GameBoxFoldCoordinator's rating construction) - it's there so
 * the *next* field that's accidentally wired to nothing logs instead of silently rendering a
 * placeholder for every item.
 */
export function warnIfFieldUncovered<T>(
    items: readonly T[],
    fieldLabel: string,
    hasValue: (item: T) => boolean
): void {
    if (items.length === 0) {
        return
    }
    const covered = items.filter(hasValue).length
    if (covered === 0) {
        logger.warn(`0 of ${items.length} items have '${fieldLabel}' data - check the data pipeline before trusting any UI wired to this field`)
    }
}
