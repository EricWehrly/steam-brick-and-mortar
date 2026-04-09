/**
 * Store Props Module - Self-Contained Props System
 *
 * Self-registering handlers activate on module import.
 * GpuStorePropsEventHandler registers as the primary handler;
 * legacy handler removed (LegacyStorePropsHandler.ts deleted).
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