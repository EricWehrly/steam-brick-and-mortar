/**
 * Store Props Module - Self-Contained Props System
 * 
 * This module provides a complete, self-contained system for managing store props
 * (shelves, games, signage, atmospheric objects) with event-driven architecture.
 * 
 * Features:
 * - Self-registering handlers that automatically set up on module import
 * - Capability-based handler selection (GPU instancing vs legacy rendering)
 * - Isolated event system with dedicated PropsEvents.ts
 * - Zero cross-dependencies (communicates only through events)
 * - Graceful fallback for test environments and older systems
 * 
 * Usage:
 * Simply import this module to activate the entire props system:
 * ```typescript
 * import './props'  // Handlers auto-register, events available
 * ```
 * 
 * Architecture:
 * - LegacyStorePropsHandler: Default handler, always available
 * - GpuStorePropsEventHandler: High-performance replacement for capable systems
 * - PropsEvents: Dedicated event types and interfaces
 * - Automatic capability detection and handler registration
 */

// Import handlers (this triggers self-registration)
import './LegacyStorePropsHandler'
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