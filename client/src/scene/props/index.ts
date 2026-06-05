/**
 * Store Props Module
 *
 * Shared store-props events and utilities. Runtime coordinators are activated
 * explicitly by the bootstrap path instead of via module side effects.
 */

// Export events and types for external use
export * from './PropsEvents'

// Export shared utilities for renderers that need them
export {
    GameLayoutConstants,
    ArtworkUtils,
    VRLayoutUtils,
    GameBoxUtils,
    ShelfSurfaceUtils,
    type ShelfSurface
} from './SharedPropsUtils'
