/**
 * Store Props Module
 *
 * Self-contained event-driven system for store props (shelves, game boxes, signage).
 * Simply importing this module activates the GPU props handler via side-effect import:
 *
 *   import './props'  // triggers GpuStorePropsEventHandler self-registration
 *
 * Architecture: GpuStorePropsEventHandler listens for StorePropsEvents and drives
 * the instanced GPU rendering pipeline. No explicit initialization needed.
 */

// Import handler (triggers self-registration)
import './GpuStorePropsEventHandler'

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