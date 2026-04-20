/**
 * Store Props Module
 *
 * Self-contained event-driven system for store props (shelves, game boxes, signage).
 * Simply importing this module activates the GPU props coordinator via side-effect:
 *
 *   import './props'  // triggers StorePropsCoordinator self-registration
 *
 * Architecture: StorePropsCoordinator registers as an override handler for
 * StorePropsEvents and drives the instanced GPU rendering pipeline.
 * No explicit initialization needed.
 */

// Side-effect imports — each module self-registers its event handlers at import time
import './StorePropsCoordinator'
import '../batch/BatchCoordinator'
import '../spawning/GameBoxSpawner'

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
